import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { chromium, webkit } from "playwright";
const fixture = JSON.parse(
  await readFile("tests/fixtures/legacy-profile.json", "utf8"),
);
const root = resolve("dist"),
  engine = process.env.BROWSER || "chromium";
let upgraded = false,
  browser;
const oldWorker = `const C='number-sums-legacy-fixture';self.addEventListener('install',e=>e.waitUntil((async()=>{const c=await caches.open(C);await c.add('/index.html');await c.put('/audio/obsolete.m4a',new Response('obsolete soundtrack'));await self.skipWaiting()})()));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(e.request.mode==='navigate')e.respondWith(caches.match('/index.html'))});`;
const oldHtml = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><h1>Legacy fixture</h1><script>
(async()=>{await new Promise((resolve,reject)=>{const r=indexedDB.open('/userfs',21);r.onupgradeneeded=()=>r.result.createObjectStore('FILE_DATA');r.onsuccess=()=>{const db=r.result,t=db.transaction('FILE_DATA','readwrite');t.objectStore('FILE_DATA').put({timestamp:new Date(),mode:33206,contents:new TextEncoder().encode('invalid primary')},'/userfs/fixture/profile.json');t.objectStore('FILE_DATA').put({timestamp:new Date(),mode:33206,contents:new TextEncoder().encode(JSON.stringify(${JSON.stringify(fixture)}))},'/userfs/fixture/profile.json.bak');t.oncomplete=()=>{db.close();resolve()};t.onerror=()=>reject(t.error)}});await navigator.serviceWorker.register('/index.service.worker.js');await navigator.serviceWorker.ready;document.body.dataset.ready='true'})();</script>`;
const mime = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
const server = createServer(async (req, res) => {
  try {
    const name = new URL(req.url, "http://localhost").pathname;
    let data, type;
    if (!upgraded && name === "/index.service.worker.js") {
      data = oldWorker;
      type = "application/javascript";
    } else if (!upgraded && (name === "/" || name === "/index.html")) {
      data = oldHtml;
      type = "text/html";
    } else {
      const path = resolve(root, "." + (name === "/" ? "/index.html" : name));
      if (!path.startsWith(root + "/")) {
        res.writeHead(403).end();
        return;
      }
      data = await readFile(path);
      type = mime[extname(path)] || "application/octet-stream";
    }
    res
      .writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" })
      .end(data);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
try {
  browser = await (engine === "webkit" ? webkit : chromium).launch({
    headless: true,
    ...(engine === "chromium"
      ? {
          ...(process.env.CHROMIUM_PATH === ""
            ? {}
            : {
                executablePath:
                  process.env.CHROMIUM_PATH || "/usr/bin/chromium",
              }),
          args: ["--mute-audio"],
        }
      : {}),
  });
  const context = await browser.newContext({
      viewport: { width: 430, height: 932 },
    }),
    page = await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(
    () =>
      document.body.dataset.ready === "true" &&
      navigator.serviceWorker.controller,
  );
  upgraded = true;
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await new Promise((resolve, reject) => {
      const watch = () => {
        const next = registration.installing || registration.waiting;
        if (!next) return;
        const state = () => {
          if (next.state === "installed") next.postMessage("activate");
          if (next.state === "activated") resolve();
          if (next.state === "redundant")
            reject(Error("replacement worker installation failed"));
        };
        next.addEventListener("statechange", state);
        state();
      };
      registration.addEventListener("updatefound", watch);
      registration.update().then(watch, reject);
    });
  });
  await page.reload();
  await page.getByRole("button", { name: /Continue puzzle/ }).waitFor();
  const saved = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const r = indexedDB.open("number-sums-browser-profile");
        r.onsuccess = () => {
          const db = r.result,
            t = db.transaction("profile"),
            q = t.objectStore("profile").get("current");
          t.oncomplete = () => {
            resolve(q.result);
            db.close();
          };
        };
      }),
  );
  assert.equal(saved.active.id, fixture.active.attempt_id);
  assert.equal(saved.active.elapsed, 42000);
  assert.equal(saved.active.lives, 1);
  assert.deepEqual(saved.active.cells, fixture.active.cells);
  assert.deepEqual(saved.stats.easy, fixture.stats.easy);
  assert.equal(saved.preferences.effects, false);
  assert.equal(saved.preferences.effectsVolume, 0.42);
  assert.equal(saved.preferences.theme, "dark");
  assert(!("music" in saved.preferences));
  const legacy = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const r = indexedDB.open("/userfs");
        r.onsuccess = () => {
          const db = r.result,
            t = db.transaction("FILE_DATA"),
            q = t.objectStore("FILE_DATA").getAll();
          t.oncomplete = () => {
            resolve(q.result.map((x) => new TextDecoder().decode(x.contents)));
            db.close();
          };
        };
      }),
  );
  assert.equal(legacy[0], "invalid primary");
  assert.deepEqual(JSON.parse(legacy[1]), fixture);
  assert(
    !(await page.evaluate(() => caches.keys())).includes(
      "number-sums-legacy-fixture",
    ),
  );
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("button", { name: /Continue puzzle/ }).click();
  await page.locator('[data-cell="0"]').waitFor();
  console.log(
    `PASS ${engine} old-worker update, backup import, full progress/statistics/effects, untouched legacy data, obsolete cache removal, offline continuation`,
  );
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
}
