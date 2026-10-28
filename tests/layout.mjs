import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { harness, fit } from "./support.mjs";
const generated = await mkdtemp(tmpdir() + "/sums-layout-");
await build({
  entryPoints: ["src/core/profile.ts", "src/core/puzzle.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outdir: generated,
  outExtension: { ".js": ".mjs" },
});
const core = await import(pathToFileURL(generated + "/puzzle.mjs")),
  profiles = await import(pathToFileURL(generated + "/profile.mjs"));
const boards = ["beginner", "easy", "medium", "hard"].map((difficulty, i) =>
  core.generate(difficulty, (i + 901).toString(16).padStart(32, "0")),
);
const h = await harness();
let checks = 0;
try {
  await mkdir("docs/previews", { recursive: true });
  for (const [width, height, dpr, touch] of [
    [375, 667, 3, true],
    [390, 844, 3, true],
    [430, 932, 3, true],
    [768, 1024, 2, true],
    [1024, 768, 2, true],
    [1366, 768, 1, false],
    [1920, 1080, 1.25, false],
    [2560, 1440, 2, false],
    [3840, 2160, 1, false],
  ]) {
    const context = await h.browser.newContext({
      serviceWorkers: "block",
      viewport: { width, height },
      deviceScaleFactor: dpr,
      hasTouch: touch,
      isMobile: touch,
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      for (const theme of ["light", "dark"]) {
        await page.goto(h.base);
        await page
          .getByRole("button", { name: "Settings", exact: true })
          .click();
        await page
          .getByRole("button", {
            name: theme === "light" ? "Light" : "Dark",
            exact: true,
          })
          .click();
        await fit(page, `${width} ${theme} all settings`);
        assert.equal(await page.locator(".settings-tabs").count(), 0);
        assert(
          await page
            .getByRole("switch", { name: "Sound effects", exact: true })
            .isVisible(),
        );
        assert(
          await page.getByLabel("Effects volume", { exact: true }).isVisible(),
        );
        checks++;
        await page.getByRole("button", { name: "Close dialog" }).click();
        await fit(page, `${width} ${theme} menu`);
        checks++;
        if (width === 375 || width === 1920)
          await page.screenshot({
            path: `docs/previews/polish-${h.engine}-${width}-${theme}-home.png`,
          });
        for (const name of ["Statistics", "How to play", "New game"]) {
          await page
            .getByRole("button", { name: new RegExp("^" + name) })
            .click();
          if (
            name === "New game" &&
            (await page
              .getByRole("button", {
                name: "Discard previous run",
                exact: true,
              })
              .count())
          )
            await page
              .getByRole("button", {
                name: "Discard previous run",
                exact: true,
              })
              .click();
          await fit(page, `${width} ${name}`);
          checks++;
          if ((width === 375 || width === 1920) && name !== "Statistics")
            await page.screenshot({
              path: `docs/previews/polish-${h.engine}-${width}-${theme}-${name === "New game" ? "difficulty" : "tutorial"}.png`,
            });
          if (name === "How to play")
            for (let n = 1; n < 3; n++) {
              await page
                .getByRole("button", { name: "Next", exact: true })
                .click();
              await fit(page, `${width} help${n + 1}`);
              checks++;
            }
          if (name === "New game")
            await page.getByRole("button", { name: "Back to menu" }).click();
          else await page.getByRole("button", { name: "Close dialog" }).click();
        }
        for (const [board, rules] of boards.flatMap((board) => [
          [board, "standard"],
          [board, "relaxed"],
        ])) {
          const profile = profiles.freshProfile();
          profile.preferences.theme = theme;
          profile.preferences.effects = false;
          profile.preferences.reduceMotion = true;
          profile.active = profiles.newAttempt(board, "fixed", rules);
          await page.goto(h.base + "/__test__/effects.html");
          await page.evaluate(
            (profile) =>
              new Promise((resolve) => {
                const r = indexedDB.open("number-sums-browser-profile", 1);
                r.onupgradeneeded = () => r.result.createObjectStore("profile");
                r.onsuccess = () => {
                  const db = r.result,
                    t = db.transaction("profile", "readwrite");
                  t.objectStore("profile").put(profile, "current");
                  t.oncomplete = () => {
                    db.close();
                    resolve();
                  };
                };
              }),
            profile,
          );
          await page.goto(h.base);
          await page.getByRole("button", { name: /Continue puzzle/ }).click();
          await page.locator('[data-cell="0"]').waitFor();
          await fit(
            page,
            `${width} ${theme} ${board.difficulty} ${rules} board`,
          );
          checks++;
          assert.equal(
            await page.locator("[data-cell]").count(),
            board.size ** 2,
          );
          if (width >= 1366) {
            const rect = await page.locator("main").boundingBox();
            assert(rect.width / width >= 0.27 && rect.width / width <= 0.4);
          }
          if (
            (width === 430 || width === 1920) &&
            board.difficulty === "medium"
          )
            await page.screenshot({
              path: `docs/previews/${h.engine}-${width}-${theme}.png`,
            });
        }
        await page.getByRole("button", { name: "Pause puzzle" }).click();
        await fit(page, `${width} pause`);
        checks++;
        if (width === 430 && touch) {
          await page
            .getByRole("button", { name: "Resume", exact: true })
            .click();
          await page.setViewportSize({ width: 932, height: 430 });
          await page
            .getByRole("alertdialog", { name: "Turn your phone upright" })
            .waitFor();
          await page.setViewportSize({ width, height });
          await page
            .getByRole("heading", { name: "Paused", exact: true })
            .waitFor();
          checks++;
        }
        await page.getByRole("button", { name: "Back to menu" }).click();
      }
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${h.engine} ${width}x${height} DPR ${dpr} all sizes, themes, dialogs`,
      );
    } finally {
      await context.close();
    }
  }
  console.log(`${checks} ${h.engine} layout checks passed`);
} finally {
  await h.close();
  await rm(generated, { recursive: true, force: true });
}
