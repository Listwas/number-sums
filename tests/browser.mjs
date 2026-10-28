import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  harness,
  fit,
  instrumentInput,
  instrumentEffects,
} from "./support.mjs";
const h = await harness(),
  { browser, engine, base: url } = h;
let checks = 0;
const check = (v, m) => {
  assert.ok(v, m);
  checks++;
  console.log("PASS", m);
};
async function profile(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open("number-sums-browser-profile");
        r.onsuccess = () => {
          const db = r.result,
            t = db.transaction("profile"),
            get = t.objectStore("profile").get("current");
          t.oncomplete = () => {
            db.close();
            resolve(get.result);
          };
          t.onerror = () => reject(t.error);
        };
        r.onerror = () => reject(r.error);
      }),
  );
}
try {
  const context = await browser.newContext({
    viewport: { width: 2560, height: 1440 },
    deviceScaleFactor: 1.25,
    colorScheme: "dark",
  });
  await context.addInitScript(instrumentInput);
  await context.addInitScript(instrumentEffects);
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.getByRole("button", { name: "New game", exact: true }).waitFor();
  check(
    (await page.locator("canvas").count()) === 0,
    "browser-native text and board, no bitmap canvas",
  );
  await page.screenshot({ path: `/tmp/ns-dom-${engine}-menu.png` });
  await page.getByRole("button", { name: "Settings", exact: true }).click();

  await page.getByRole("switch", { name: "Sound effects" }).click();
  await page.getByLabel("Effects volume", { exact: true }).fill("37");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await page.getByRole("button", { name: /Easy 4/ }).click();
  await page.locator('[data-cell="0"]').waitFor();
  await page.waitForTimeout(100);
  let saved = await profile(page);
  check(saved.active.puzzle.size === 4, "worker generates Easy puzzle");
  check(
    saved.preferences.effectsVolume === 0.37 &&
      !saved.preferences.effects &&
      !("music" in saved.preferences),
    "sound settings persist",
  );
  for (const [w, h, dpr] of [
    [430, 932, 1.25],
    [1920, 1080, 1.25],
    [2560, 1440, 1.25],
    [3840, 2160, 1.25],
    [1024, 1366, 1.25],
    [320, 568, 1.25],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(100);
    const bounds = await page.evaluate(() => {
      const b = document.querySelector(".board").getBoundingClientRect(),
        m = document.querySelector(".mode").getBoundingClientRect();
      return {
        b: b.toJSON(),
        m: m.toJSON(),
        font: getComputedStyle(document.querySelector(".cell")).fontFamily,
      };
    });
    check(bounds.b.left >= 0 && bounds.b.right <= w + 1, `${w}px board fits`);
    check(
      bounds.m.left >= 0 && bounds.m.right <= w + 1,
      `${w}px mode selector fits`,
    );
    check(bounds.font.includes("system-ui"), `${w}px native system font`);
    await fit(page, `${w}px all controls fit`);
    await page.screenshot({ path: `/tmp/ns-dom-${engine}-${w}.png` });
  }
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.getByRole("button", { name: "Pause puzzle" }).click();
  const elapsed1 = (await profile(page)).active.elapsed;
  await page.waitForTimeout(1100);
  check(
    (await profile(page)).active.elapsed === elapsed1,
    "pause stops saved time",
  );
  check(
    await page.getByRole("button", { name: "Resume", exact: true }).isVisible(),
    "pause offers Resume",
  );
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: /Continue puzzle/ }).click();
  check(
    (await profile(page)).active.puzzle.seed === saved.active.puzzle.seed,
    "pause Home preserves the puzzle for Continue",
  );
  const board = saved.active.puzzle;
  let index = board.answer.findIndex(Boolean);
  await page.getByRole("button", { name: "Erase", exact: true }).click();
  await page.locator(`[data-cell="${index}"]`).click();
  await page.waitForTimeout(100);
  check((await profile(page)).active.lives === 2, "mistake costs one heart");
  await page.getByRole("button", { name: "Mark", exact: true }).click();
  await page.locator(`[data-cell="${index}"]`).click();
  check(
    await page.locator(`[data-cell="${index}"]`).isDisabled(),
    "correct answer locks",
  );
  const ringFrames = await page.locator(`[data-cell="${index}"]`).evaluate(
    (cell) =>
      new Promise((resolve) => {
        const frames = [];
        const sample = () => {
          const box = cell.getBoundingClientRect(),
            ring = cell.querySelector(".mark-ring").getBoundingClientRect();
          frames.push({
            ratio: ring.width / box.width,
            round: Math.abs(ring.width - ring.height),
          });
          if (frames.length < 6) requestAnimationFrame(sample);
          else resolve(frames);
        };
        sample();
      }),
  );
  check(
    ringFrames.every((frame) => frame.ratio >= 0.6 && frame.round < 1),
    "mark outline starts and remains a full-sized circle",
  );

  await page.waitForFunction(
    (index) =>
      window.inputFrames.some(
        (f) => f.index === index && f.after.includes("marked"),
      ),
    index,
    { timeout: 2000 },
  );
  check(
    await page.evaluate(
      (index) =>
        window.inputFrames.some(
          (f) => f.index === index && f.after.includes("marked"),
        ),
      index,
    ),
    "accepted choice is visible in the first two animation frames",
  );
  await page.locator(`[data-cell="${index}"]`).evaluate((el) => {
    for (let n = 0; n < 100; n++) el.click();
  });
  check(
    (await profile(page)).active.lives === 2,
    "rapid repeats on a resolved cell do not apply another choice",
  );
  await page.waitForFunction(async (index) => {
    const p = await new Promise((resolve) => {
      const r = indexedDB.open("number-sums-browser-profile");
      r.onsuccess = () => {
        const db = r.result,
          t = db.transaction("profile"),
          g = t.objectStore("profile").get("current");
        t.oncomplete = () => {
          db.close();
          resolve(g.result);
        };
      };
    });
    return p.active.cells[index] === 1;
  }, index);
  await page.reload();
  await page.getByRole("button", { name: /Continue puzzle/ }).waitFor();
  await page.getByRole("button", { name: /Continue puzzle/ }).click();
  check(
    await page.locator(`[data-cell="${index}"]`).isDisabled(),
    "resolved answer survives reload",
  );
  for (let i = 0; i < board.answer.length; i++) {
    if (i === index) continue;
    await page
      .getByRole("button", {
        name: board.answer[i] ? "Mark" : "Erase",
        exact: true,
      })
      .click();
    await page.locator(`[data-cell="${i}"]`).click();
  }
  await page.getByText("Puzzle complete", { exact: true }).waitFor();
  await page.waitForTimeout(100);
  saved = await profile(page);
  check(
    saved.stats.easy.wins === 1 && saved.stats.easy.generated_completed === 1,
    "completion counted once",
  );
  check(
    (await page
      .getByRole("button", { name: "Replay puzzle", exact: true })
      .isVisible()) &&
      (await page
        .getByRole("button", { name: "Next puzzle", exact: true })
        .isVisible()),
    "completion offers replay/next",
  );
  check(
    !(await page.getByRole("button", { name: "Resume", exact: true }).count()),
    "completed puzzle has no resume",
  );
  await page.getByRole("button", { name: "Back to menu" }).click();
  await page.getByRole("button", { name: /^Statistics/ }).click();
  check(
    (await page.locator(".stats-grid>div").count()) === 6,
    "six statistics cards",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: /^How to play/ }).click();
  const beforePractice = await profile(page);
  await page.getByRole("button", { name: "Practice number 2" }).click();
  await page.getByRole("button", { name: "Practice number 3" }).click();
  await page
    .getByRole("group", { name: "Practice mode" })
    .getByRole("button", { name: "Erase", exact: true })
    .click();
  await page.getByRole("button", { name: "Practice number 4" }).click();
  check(
    await page
      .getByText("Solved! 2 + 3 = 5, and 4 is left out.", { exact: true })
      .isVisible(),
    "tutorial practice demonstrates mark and erase",
  );
  const afterPractice = await profile(page);
  check(
    beforePractice.active.id === afterPractice.active.id &&
      JSON.stringify(beforePractice.active.cells) ===
        JSON.stringify(afterPractice.active.cells) &&
      JSON.stringify(beforePractice.stats) ===
        JSON.stringify(afterPractice.stats),
    "tutorial practice leaves puzzle progress and statistics untouched",
  );
  for (let i = 0; i < 2; i++)
    await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  check(
    !(await page.locator("dialog[open]").count()),
    "three-step tutorial opens difficulty selection",
  );
  await page.waitForFunction(
    () => navigator.serviceWorker.controller !== null,
    null,
    { timeout: 30000 },
  );
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("button", { name: "New game", exact: true }).waitFor();
  check(true, "offline reload works");
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await page.getByRole("button", { name: /Beginner 3/ }).click();
  await page.locator('[data-cell="0"]').waitFor();
  check(
    (await page.locator("[data-cell]").count()) === 9,
    "fresh offline puzzle generated in worker",
  );
  // Rule choice is attached to the attempt, and tutorial Play resumes it.
  saved = await profile(page);
  const standardId = saved.active.id;
  await page.getByRole("button", { name: "Pause puzzle" }).click();
  await page.getByRole("button", { name: "How to play", exact: true }).click();
  await page.getByRole("button", { name: "Close dialog" }).click();
  check(
    await page.getByRole("button", { name: "Resume", exact: true }).isVisible(),
    "closing help preserves pause",
  );
  await page.getByRole("button", { name: "How to play", exact: true }).click();
  for (let i = 0; i < 2; i++)
    await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  check(
    (await profile(page)).active.id === standardId &&
      !(await page
        .getByRole("button", { name: "Resume", exact: true })
        .count()),
    "tutorial Play resumes the same paused puzzle",
  );
  await page.getByRole("button", { name: "Back to menu" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();

  await page
    .getByRole("switch", { name: "Sound effects", exact: true })
    .click();

  check(
    !(await page.getByRole("button", { name: "Toggle fullscreen" }).count()),
    "fullscreen removed from device settings",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: /Continue puzzle/ }).click();
  saved = await profile(page);
  const wrongMode = saved.active.puzzle.answer[0] ? "Erase" : "Mark";
  await page.getByRole("button", { name: wrongMode, exact: true }).click();
  await page.evaluate(() => {
    window.effectEvents = [];
  });
  await page.locator('[data-cell="0"]').click();
  await page.waitForTimeout(100);
  await page.locator('[data-cell="0"]').click();
  await page.waitForTimeout(100);
  await page.locator('[data-cell="0"]').click();
  await page.getByText("Out of lives", { exact: true }).waitFor();
  check(
    await page.evaluate(
      () =>
        window.effectEvents.some(
          (e) => e.hz > 720 && e.hz < 760 && e.duration > 0.2,
        ) &&
        window.effectEvents.filter(
          (e) => e.hz > 380 && e.hz < 405 && e.duration > 0.15,
        ).length === 1,
    ),
    "mistake and terminal loss play distinct audible cues once",
  );
  await page.getByRole("button", { name: "Back to menu" }).click();
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await page.getByRole("switch", { name: "Relaxed mode" }).click();
  await page.getByRole("button", { name: /Beginner 3/ }).click();
  await page.locator('[data-cell="0"]').waitFor();
  await page.waitForTimeout(100);
  saved = await profile(page);
  check(
    saved.active.rules === "relaxed" &&
      (await page.getByText("No life limit", { exact: true }).isVisible()),
    "difficulty switch creates a relaxed puzzle",
  );
  const relaxedId = saved.active.id;
  await page
    .getByRole("button", {
      name: saved.active.puzzle.answer[0] ? "Erase" : "Mark",
      exact: true,
    })
    .click();
  for (let i = 0; i < 5; i++) await page.locator('[data-cell="0"]').click();
  await page.waitForTimeout(100);
  saved = await profile(page);
  check(
    saved.active.lives === 3 &&
      saved.active.cells[0] === 0 &&
      saved.active.status === "playing",
    "relaxed mistakes do not consume lives or resolve cells",
  );
  await page.getByRole("button", { name: "Back to menu" }).click();
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await page.getByRole("button", { name: "Close dialog" }).click();
  check(
    (await profile(page)).active.id === relaxedId &&
      (await profile(page)).active.rules === "relaxed",
    "canceling replacement preserves the saved puzzle and rules",
  );
  await page.getByRole("button", { name: /Continue puzzle/ }).click();
  saved = await profile(page);
  for (let i = 0; i < saved.active.cells.length; i++) {
    await page
      .getByRole("button", {
        name: saved.active.puzzle.answer[i] ? "Mark" : "Erase",
        exact: true,
      })
      .click();
    await page.locator(`[data-cell="${i}"]`).click();
  }
  await page.getByText("Puzzle complete", { exact: true }).waitFor();
  await page.waitForTimeout(100);
  saved = await profile(page);
  check(
    saved.relaxedStats.beginner.wins === 1 &&
      saved.stats.beginner.wins === 0 &&
      saved.relaxedStats.beginner.playtime_ms > 0,
    "relaxed results and active playtime are separate from standard",
  );
  await page.getByRole("button", { name: "Next puzzle", exact: true }).click();
  await page.locator('[data-cell="0"]').waitFor();
  await page.waitForTimeout(100);
  check(
    (await profile(page)).active.rules === "relaxed",
    "Next puzzle uses the chosen future rule preference",
  );
  await page.getByRole("button", { name: "Back to menu" }).click();
  await page.getByRole("button", { name: "Statistics", exact: true }).click();
  await page.getByLabel("Statistics difficulty").selectOption("beginner");
  check(
    (await page
      .locator(".stats-grid>div")
      .nth(1)
      .locator("strong")
      .textContent()) === "0",
    "Standard statistics filter excludes relaxed wins",
  );
  await page.getByRole("button", { name: "Relaxed", exact: true }).click();
  check(
    (await page
      .locator(".stats-grid>div")
      .nth(1)
      .locator("strong")
      .textContent()) === "1",
    "Relaxed statistics filter shows its own wins",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  check(errors.length === 0, "no uncaught errors: " + errors.join(";"));
  await context.close();
  // Real Emscripten storage schema migration, on a separate clean browser profile.
  const legacy = await browser.newContext({
      viewport: { width: 430, height: 932 },
    }),
    lp = await legacy.newPage();
  await lp.goto(url);
  await lp.getByRole("button", { name: "New game", exact: true }).waitFor();
  const authored = JSON.parse(
    await readFile("src/core/authored.json", "utf8"),
  )[0];
  await lp
    .evaluate(async (board) => {
      await new Promise((resolve, reject) => {
        const r = indexedDB.deleteDatabase("number-sums-browser-profile");
        r.onblocked = () => reject(Error("profile still open"));
        r.onerror = () => reject(r.error);
        r.onsuccess = resolve;
      });
    }, authored)
    .catch(() => {});
  // Use a fresh origin context, seed before app scripts run.
  await legacy.close();
  const migration = await browser.newContext({
    viewport: { width: 430, height: 932 },
  });
  await migration.addInitScript(async (board) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    await new Promise((resolve, reject) => {
      const r = indexedDB.open("/userfs", 21);
      r.onupgradeneeded = () => r.result.createObjectStore("FILE_DATA");
      r.onsuccess = () => {
        const db = r.result,
          t = db.transaction("FILE_DATA", "readwrite"),
          stats = {
            completed_ids: ["easy-previous"],
            generated_completed: 4,
            wins: 6,
            losses: 2,
            total_win_ms: 60000,
            best_win_ms: 5000,
            playtime_ms: 120000,
          };
        t.objectStore("FILE_DATA").put(
          {
            timestamp: new Date(),
            mode: 33206,
            contents: new TextEncoder().encode(
              JSON.stringify({
                version: 1,
                stats: { easy: stats },
                last_result_id: "previous",
                preferences: {
                  appearance: "dark",
                  music_enabled: false,
                  sound_enabled: false,
                  music_track: "slow_tide",
                  music_volume: 0.3,
                  music_volume_revision: 1,
                },
                active: {
                  puzzle_id: board.id,
                  attempt_id: "migrated",
                  cells: board.values.map(() => 0),
                  lives: 1,
                  mode: 1,
                  elapsed_ms: 42000,
                },
              }),
            ),
          },
          "/userfs/test/profile.json",
        );
        t.oncomplete = () => {
          db.close();
          resolve();
        };
        t.onerror = () => reject(t.error);
      };
      r.onerror = () => reject(r.error);
    });
  }, authored);
  const mp = await migration.newPage();
  await mp.goto(url);
  await mp.getByRole("button", { name: /Continue puzzle/ }).waitFor();
  const migrated = await profile(mp);
  check(
    migrated.active.id === "migrated" &&
      migrated.active.elapsed === 42000 &&
      migrated.active.lives === 1,
    "actual IDBFS save migrates",
  );
  check(
    migrated.stats.easy.wins === 6 &&
      migrated.stats.easy.generated_completed === 4 &&
      migrated.stats.easy.playtime_ms === 120000,
    "actual IDBFS statistics migrate",
  );
  check(
    migrated.preferences.theme === "dark" &&
      !migrated.preferences.effects &&
      !("music" in migrated.preferences),
    "actual IDBFS preferences migrate",
  );
  await migration.close();
  console.log(`${checks} ${engine} browser checks passed`);
} finally {
  await h.close();
}
