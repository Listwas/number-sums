import assert from "node:assert/strict";
import { harness, fit } from "./support.mjs";
const game = "number-sums",
  database = "number-sums-browser-profile";
const h = await harness();
async function profile(page) {
  return page.evaluate(
    (name) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open(name, 1);
        req.onsuccess = () => {
          const db = req.result,
            tx = db.transaction("profile"),
            read = tx.objectStore("profile").get("current");
          read.onsuccess = () => {
            resolve(read.result);
            db.close();
          };
          read.onerror = () => reject(read.error);
        };
        req.onerror = () => reject(req.error);
      }),
    database,
  );
}
async function saved(page, predicate) {
  for (let n = 0; n < 100; n++) {
    const p = await profile(page);
    if (p && predicate(p)) return p;
    await page.waitForTimeout(30);
  }
  throw Error("Save did not reach expected state");
}
try {
  for (const theme of ["Light", "Dark"]) {
    const context = await h.browser.newContext({
      viewport: { width: 320, height: 568 },
      hasTouch: true,
      isMobile: true,
    });
    try {
      const page = await context.newPage();
      await page.goto(h.base);
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByRole("button", { name: theme, exact: true }).click();
      await page.getByRole("button", { name: "Close dialog" }).click();
      await page.getByRole("button", { name: "New game", exact: true }).click();
      assert.equal(await page.getByRole("dialog").count(), 0);
      assert.equal(
        await page
          .getByText("No life limit. Applies to your next puzzle.", {
            exact: true,
          })
          .count(),
        1,
      );
      assert(
        !/Standard · (Two|Three) lives/.test(
          await page.locator("body").innerText(),
        ),
      );
      await page.getByRole("button", { name: /Easy/ }).click();
      await page.locator('[data-cell="0"]').waitFor();
      const initial = await saved(page, (p) => !!p.active);
      if (game === "number-sums") {
        assert.equal(initial.active.lives, 3);
        assert.equal(await page.locator(".hearts svg").count(), 3);
      }

      await page
        .getByRole("button", {
          name:
            game === "nonogram"
              ? initial.active.puzzle.answer[0]
                ? "Fill"
                : "Cross"
              : initial.active.puzzle.answer[0]
                ? "Mark"
                : "Erase",
          exact: true,
        })
        .click();
      await page.locator('[data-cell="0"]').click();
      const progress = await saved(page, (p) => !!p.active?.cells[0]);
      const menu = () =>
        page
          .getByRole("button", {
            name: game === "nonogram" ? "Menu" : "Back to menu",
            exact: true,
          })
          .click();
      const newGame = () =>
        page.getByRole("button", { name: "New game", exact: true }).click();
      await menu();
      await newGame();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      await fit(page, `320 ${theme} new-game decision`);
      assert.equal(await page.locator(".difficulty-list").count(), 0);
      assert(
        await dialog
          .getByRole("button", { name: "Continue puzzle", exact: true })
          .evaluate((el) => el.classList.contains("primary")),
      );
      assert(
        !(await dialog
          .getByRole("button", { name: "Discard previous run", exact: true })
          .evaluate((el) => el.classList.contains("primary"))),
      );
      await page.getByRole("button", { name: "Close dialog" }).click();
      assert.equal((await profile(page)).active.id, progress.active.id);
      await newGame();
      await dialog
        .getByRole("button", { name: "Continue puzzle", exact: true })
        .click();
      await page.locator('[data-cell="0"]').waitFor();
      assert.deepEqual(
        (await profile(page)).active.cells,
        progress.active.cells,
      );
      await menu();
      await newGame();
      const before = await saved(
        page,
        (p) => p.active?.id === progress.active.id,
      );
      await dialog
        .getByRole("button", { name: "Discard previous run", exact: true })
        .click();
      await page.locator(".difficulty-list").waitFor();
      const after = await saved(page, (p) => p.active === null);
      assert.deepEqual(after.stats, before.stats);
      if (game === "number-sums")
        assert.deepEqual(after.relaxedStats, before.relaxedStats);
      assert.equal(await page.getByRole("dialog").count(), 0);
      await page.reload();
      await page
        .getByRole("button", { name: "New game", exact: true })
        .waitFor();
      assert.equal((await profile(page)).active, null);
      assert.equal(
        await page.getByRole("button", { name: /^Continue puzzle/ }).count(),
        0,
      );
      await newGame();
      await page.getByRole("button", { name: /Easy/ }).click();
      await page.locator('[data-cell="0"]').waitFor();
      const next = await saved(page, (p) => !!p.active);
      assert.notEqual(next.active.id, progress.active.id);
      assert.equal(await page.getByRole("dialog").count(), 0);
    } finally {
      await context.close();
    }
  }
  console.log(
    `PASS ${game} ${h.engine}: prompt before difficulty, primary Continue preserves progress, cancel preserves save, discard persists across reload and retains statistics, no second prompt, compact both themes`,
  );
} finally {
  await h.close();
}
