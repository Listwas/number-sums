# Battery work and preview frame limit - 28 October 2026

The app renders on demand. There is no continuous idle game loop. The browser controls display refresh and CSS animation cadence; this update does not claim a global 60 FPS hardware limit. Gameplay clocks update once per second only while playing. Existing timed checkpoints and lifecycle save flushes remain.

An already-unlocked sound engine ignores silent gestures instead of resuming an idle context or repeatedly extending its idle timeout. Muted/zero-volume/hidden audio remains stopped. Duplicate note aliases share their identical synthesized buffers, reducing preparation and retained audio data. The original voices, sound design and effect deadlines remain. The context suspends 600ms after its last voice finishes, with no truncation; ended-voice cleanup also handles a missed earlier idle check. First trusted activation, delayed start cues and actual PCM after idle pass in both browsers.

Number Sums cancels generation and clears its deadline on hide/pagehide. Pageshow resets audio visibility without waking it. A six-second parent watchdog bounds a stalled worker, complementing the existing five-second generator budget; construction/postMessage failures leave loading state and preserve existing progress. Snapshots defer past a paint opportunity with immediate lifecycle flush. Generated puzzle rules and uniqueness are unchanged.

23 unit tests and the production build passed. Chromium/WebKit gameplay passed (54 in each engine), along with real-PCM runtime checks and fresh-start/mute tests. The new npm run test:battery is included in CI: zero app animation-frame callbacks in idle menus/pause, no thinking-time frame loop, fixed paused/hidden clocks, suspended idle audio, no silent-input resume, hidden-worker termination and rejection of late replies/fallback. Worker construction failure is also checked. Legacy browser-save import checks passed. Save scheduler tests cover post-paint snapshots and immediate flush.

Tests ran headlessly and sequentially on one low-priority core in 2 GiB/no-swap scopes. Evidence: docs/validation/battery-*. No phone energy/temperature or battery-life percentage was measured; desktop WebKit is not a physical iPhone. The battery benefit is reduced unnecessary work, not a measured battery-duration promise.

Production https://number-sums-game.pages.dev/; deployment https://2bf07450.number-sums-game.pages.dev; offline build `11f4edd3a27c8f`. All 13 assets (325,135 bytes) match local bytes. Live Chromium/WebKit input, save/reload and offline continuation passed.

Repository preparation adds a current gameplay screenshot, a player-focused README, a development guide, and exclusions for local logs/builds/caches. Third-party notices were trimmed only at EOF; fresh builds, bounded release-verifier checks, and both live engines passed afterward. Number Sums now includes the documented preview command and rebuilds before deployment. No license was chosen for original code.

---

# Immersive fullscreen request correction - 21 October 2026

The fullscreen button now attempts the standard/prefixed Fullscreen API before considering manifest display mode. An installed app reporting display-mode:fullscreen is not proof that device status bars are hidden. Removed the misleading already-fullscreen dialog and Fullscreen options label; Enter fullscreen stays actionable unless an actual API fullscreen element exists. Unsupported installed browsers explain the status-bar limitation; rejected requests no longer advise reopening the same installed app. Home Screen launch metadata and safe-area layout are unchanged.

All 74 units and three builds passed. Each app passes seven fullscreen scenarios in Chromium and WebKit, including the new installed+API-supported regression: a real request call with navigationUI:hide, state/label update and exit are required even with display-mode:fullscreen. Other cases cover prefixed API, unsupported/standalone/installed devices, denied requests, mobile placement, theme persistence and no-scroll dialog fit. Tests use simulated platform states; they do not establish that physical Android/iOS system bars disappear. Logs: validation/immersive-*.log. Checks remained headless, sequential, one low-priority core in separate 2 GiB/no-swap scopes.

Production https://number-sums-game.pages.dev/; deployment https://b6cd23b5.number-sums-game.pages.dev; offline build `d0038336869281`. All 13 published files (324,122 bytes) match local bytes. Live Chromium/WebKit input, save/reload and offline continuation passed.

---

# Home Screen fullscreen and mobile control - 21 October 2026

Fullscreen control remains visible beside Settings on phones/tablets and desktop, instead of disappearing when Fullscreen API is unavailable. A local independent component handles standard and prefixed enter/exit, installed-fullscreen status, mode changes, denied requests and a compact Home Screen guidance dialog. Installed fullscreen is controlled by the manifest, with no automatic gesture-restricted API calls at startup. iOS boot and runtime status-bar metadata consistently use black-translucent with existing viewport-fit=cover and safe-area padding; device status indicators may remain. Existing identities, storage and saves are preserved. The legacy index.manifest.json now requests fullscreen with a standalone fallback, preserving id/scope/start_url.

74 unit tests and production builds passed across the three apps. Each app passes six focused fullscreen scenarios in Chromium and WebKit: standard/prefixed enter/exit, unsupported phones, standalone Home Screen launch, installed fullscreen and denied requests. Checks assert button placement beside Settings, no startup request, launch metadata, theme persistence, compact no-scroll guidance and no browser errors. Existing Chromium/WebKit gameplay suites passed (Blocks 60/55, Nonogram 38/38, Number Sums 54/54). New npm run test:fullscreen is included in CI. Logs: validation/fullscreen-*.log. Heavy checks remained headless, sequential, one low-priority core and separate 2 GiB/no-swap scopes. Physical iOS status-bar behavior is not established by desktop WebKit simulations.

Production https://number-sums-game.pages.dev/; deployment https://52eff95c.number-sums-game.pages.dev; offline build `1926a471d1a35e`. All 13 files (324,180 bytes) match local build bytes. Live Chromium/WebKit save/reload, accepted input and offline continuation passed.

---

# Gameplay alignment and action styling - 21 October 2026

The gameplay status row now places hearts on the left, grid size in the center and timer on the right, matching Nonogram while preserving the existing Number Sums board and controls.

Validation: Tests  20 passed (20); 54 chromium browser checks passed; 54 webkit browser checks passed; 290 chromium layout checks passed; 290 webkit layout checks passed. Startup/restart sound-flow checks passed in both engines. Nonogram's layout suite also asserts mode-switch left/right edges match the playable cells across all sizes, themes and rule modes. Logs: `validation/alignment-*.log`. Reviewed headless gameplay captures; no visible testing. Checks ran sequentially on one low-priority core in separate 2 GiB/no-swap scopes.

Production https://number-sums-game.pages.dev/; deployment https://bf134837.number-sums-game.pages.dev, offline build `75e9ca095c0c27`. All 13 published files (322,757 bytes) match local bytes. Live Chromium/WebKit checks passed for input, save/reload and offline continuation.

---

# Tutorial, new-run prompt and sound update - 20 October 2026

Incorrect answers now use a distinct descending, woody double knock (740/494 Hz, 210 ms), versus the unchanged single-note correct mark. The new start chime is a gentle A-major rising three-note pluck with a soft second harmonic (440/554/659 Hz, 310 ms). It plays when a newly generated board is accepted and on a fresh replay/restart, with no chime on Continue.

All new cues use the existing Sound effects preference and volume. Startup/error notes have short attack/release envelopes and end at zero. The bounded single AudioContext/buffer engine retains its deadline, repeat coalescing, four-voice limit, background cancellation and idle suspension. No music, asset downloads or continuous audio loops were added. Loss and correct-choice cues are unchanged; the distinct error pattern applies to Number Sums and Nonogram.

Unit/build, gameplay and audio/runtime checks passed in Chromium/WebKit. Permanent `npm run test:start`, included in CI, checks one real startup buffer per fresh attempt, silence on Continue, primary Continue/discard at 320x568, fresh IDs/reset score, and mute/zero-volume behavior. Blocks additionally delays the first worker deal by one second to reject premature playback, and passes tap-only tutorial fit/input checks at compact/phone/desktop sizes in both themes. Puzzle restart cues are checked once; real mistake/loss buffers remain distinct in the gameplay suites. Evidence: `validation/start-*.log`. Full gameplay counts remain Blocks 60 Chromium/55 WebKit, Number Sums 54/54 and Nonogram 38/38; 74 unit tests total, 11 audio runtime checks per game/engine.

Latest production: https://number-sums-game.pages.dev/; deployment `1992cab6`, offline build `5456bdd95a8c51`. All 13 files (322,399 bytes) match local assets; live Chromium/WebKit save/reload/offline continuation passed. All heavy jobs were headless, sequential, one low-priority core and separate 2 GiB/no-swap scopes. Browser/server cleanup was verified. Physical-device audibility remains separate from automated buffer/PCM checks.

---

# Gameplay text cleanup - 20 October 2026

The explanatory paragraph below Erase/Mark is completely removed. Menus, dialogs, gameplay labels, clues and numbers cannot be selected by mouse dragging or long press. Body-level standard/WebKit selection suppression and iOS callout suppression apply throughout the interface; editable controls keep their normal behavior. No game rules, saves or difficulty behavior changed.

Unit/build and Chromium/WebKit gameplay suites passed. Focused headless checks exercised actual text-selection drags on menu headings and game metadata, checked volume editing, absence of hint rows and layout fit at 320x568, 430x932 and 1920x1080 in both themes. Captures were reviewed. Blocks' tall-piece/score/undo placement regression still passes immediately and after feedback fades. Evidence: `validation/selection-*.log`; captures in ignored `previews/selection-*`. The temporary visual fixture was removed after validation. Earlier broader checks remain below.

Latest production: https://number-sums-game.pages.dev/; deployment `47568417`, offline build `4392b791b1c0f8`. All 13 files (322,157 bytes) match local assets; live Chromium/WebKit save/reload/offline continuation passed. Every heavy job was headless, sequential, one low-priority core, separate 2 GiB/no-swap scope. Browsers and servers were closed.

---

# New game and lives update - 20 October 2026

New game asks about an unfinished attempt before difficulty selection. Primary **Continue puzzle** resumes the same attempt. **Discard previous run** removes it immediately, keeps statistics and opens difficulty selection. Closing the dialog leaves it intact. Completed puzzles skip the prompt. Difficulty choices do not show a second confirmation. Both difficulty screens show “No life limit. Applies to your next puzzle.” directly under Relaxed mode, with no separate Standard/lives subtitle or repeated hint.

New Number Sums attempts and restarts have three lives. Existing saved attempts retain their remaining lives. Hearts, tutorial text and profile validation agree with the new default; old one/two-life saves remain valid. Unit tests and Chromium/WebKit gameplay, feedback and discard-flow checks passed. The dedicated `npm run test:discard` covers compact 320x568 in both themes, cancellation, preserving marked progress, primary-button hierarchy, persisted deletion after reload, unchanged statistics, and starting a new puzzle without another prompt. It checks the single Relaxed description and three visible hearts for a fresh Number Sums attempt. Number Sums' legacy migration tests remain passing. Nonogram's generation-cancellation edge tests pass with the new explicit-discard semantics. Evidence: `validation/discard-*.log`. Earlier broader layout and audio evidence is retained below.

Latest production: https://number-sums-game.pages.dev/; deployment `28293046`, offline build `3ad8c5612b8974`. All 13 files (322,285 bytes) match the local build. Live Chromium/WebKit checks passed for accepted input, theme, save/reload and offline continuation. Test browsers/servers were closed; every heavy job remained headless, sequential, one low-priority core, capped at 2 GiB RAM with no swap.

---

# Tutorial and feedback verification - 20 October 2026

Mark feedback uses a fixed SVG outline fading in at its full size, avoiding the scaled CSS border. Difficulty choices have rounded surfaces and inset arrows. Home in Pause preserves the puzzle for Continue. Visible text uses regular hyphens. Existing centered compositions, single settings/statistics popups, saves and app identities are preserved.

## Checks

- Unit tests: 20 passed (`validation/feedback-unit.log`). Production build passed.
- Gameplay: 54 Chromium / 54 WebKit checks passed (`validation/feedback-*-browser.log`). Includes saved-game navigation, offline continuation and accepted input feedback.
- Layout: 290 Chromium / 290 WebKit checks passed (`validation/feedback-*-layout.log`), phone/tablet/desktop through 4K, both themes.
- `npm run test:feedback` passed in both engines: compact 320x568, phone 430x932, desktop 1920x1080, both themes. Checks rounded inset difficulty rows or tutorial fit and input. Blocks also covers outside-drop cancellation and native touch drag in Chromium, plus select/tap input and mouse drag in both engines.
- `npm run test:popups` passed in both engines. Settings and statistics remain visible together without scrolling at 320x568.
- Safe release-verifier regression passed (`validation/feedback-release-safety.log`). Live verification below checks the published payload; this project has no separate audit script.
- The mark outline remains full-sized and circular across the initial animation frames. Home/Continue preserves the puzzle, progress and remaining lives. Existing legacy IDBFS migration checks pass.

All tests run headlessly, sequentially, on one low-priority core inside separate 2 GiB/no-swap user scopes. Browsers and servers close in finally. Automated WebKit does not establish physical iPhone rendering, audibility, latency or temperature.

## Published release

- Production: https://number-sums-game.pages.dev/
- Deployment: `1be4b2c0`; offline build: `3a00896468db59`.
- Full offline payload: 322,513 bytes across 13 files.
- All deployed assets match local bytes. Chromium/WebKit both accepted a move, changed theme, reloaded saves and continued offline. Evidence: `live-chromium.json`, `live-webkit.json`, `validation/feedback-live-*.log`.
- No music, generator changes, database renaming or GitHub publication.
