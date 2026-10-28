import { FullscreenButton } from "./components/FullscreenButton";
import { PortraitGuard, phoneLandscape } from "./PortraitGuard";
import { useEffect, useRef, useState } from "react";
import { AudioEngine } from "./audio";
import {
  ProfileStore,
  attemptStats,
  type Rules,
  completed,
  emptyStats,
  finalize,
  newAttempt,
  play,
  type Profile,
  type Preferences,
  type Stats,
} from "./core/profile";
import { clues, groups, SIZES, type Difficulty } from "./core/puzzle";
import { Tutorial } from "./components/Tutorial";
import { Board } from "./components/Board";
import { Icon } from "./components/Icon";
import { Dialog } from "./components/Dialog";
import { applyAppearance } from "./platform";
import { useOffline, OfflineStatus } from "./offline";
const title = (d: string) =>
  d === "custom" ? "Saved puzzle" : d[0].toUpperCase() + d.slice(1);
const time = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
};
function Clock({ get, running }: { get: () => number; running: boolean }) {
  const [, redraw] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => redraw((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  return <time>{time(get())}</time>;
}
function Toggle({
  label,
  value,
  onChange,
  detail,
  disabled = false,
}: {
  label: string;
  value: boolean;
  onChange: () => void;
  detail?: string;
  disabled?: boolean;
}) {
  return (
    <button
      className="setting-row"
      role="switch"
      aria-label={label}
      disabled={disabled}
      aria-checked={value}
      onClick={onChange}
    >
      <span>
        {label}
        {detail && <small>{detail}</small>}
      </span>
      <span className={"switch " + (value ? "on" : "")} aria-hidden="true">
        <i />
      </span>
    </button>
  );
}
function Volume({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="volume">
      <span>
        {label}
        <output>{Math.round(value * 100)}%</output>
      </span>
      <input
        aria-label={label}
        type="range"
        min="0"
        max="100"
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
      />
    </label>
  );
}
type Sheet = "" | "settings" | "help" | "stats" | "replace";
export function App({
  profile: p,
  store,
}: {
  profile: Profile;
  store: ProfileStore;
}) {
  const [, redraw] = useState(0),
    [screen, setScreen] = useState<"menu" | "game" | "difficulty">("menu"),
    [sheet, setSheet] = useState<Sheet>(""),
    [paused, setPaused] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(store.notice),
    [statsRules, setStatsRules] = useState<Rules>("standard"),
    [statsCategory, setStatsCategory] = useState("all"),
    [mistake, setMistake] = useState<{ index: number; id: number } | null>(
      null,
    );
  useEffect(() => {
    if (!mistake) return;
    const timer = setTimeout(() => setMistake(null), 280);
    return () => clearTimeout(timer);
  }, [mistake]);
  const offline = useOffline(),
    audio = useRef<AudioEngine | null>(null),
    worker = useRef<Worker | null>(null),
    generationDeadline = useRef<ReturnType<typeof setTimeout> | undefined>(
      undefined,
    ),
    lastTick = useRef<number | null>(null),
    running = useRef(false),
    pauseRef = useRef(() => {}),
    prefsRef = useRef<(x: Partial<Preferences>) => void>(() => {}),
    saveFailed = useRef(false);
  if (!audio.current) audio.current = new AudioEngine({ ...p.preferences });
  const sound = audio.current,
    a = p.active;
  const refresh = () => redraw((v) => v + 1);
  function collect() {
    if (lastTick.current === null || !p.active) return;
    const now = performance.now(),
      delta = Math.max(0, Math.round(now - lastTick.current));
    p.active.elapsed += delta;
    attemptStats(p, p.active).playtime_ms += delta;
    lastTick.current = now;
  }
  async function save() {
    collect();
    try {
      await store.save(p);
      if (saveFailed.current) {
        saveFailed.current = false;
        setError("");
      }
    } catch (e) {
      saveFailed.current = true;
      setError("Could not save. Keep this tab open and try again.");
      throw e;
    }
  }
  function persist() {
    void save().catch(() => {});
  }
  const getElapsed = () =>
    p.active
      ? p.active.elapsed +
        (lastTick.current === null
          ? 0
          : Math.max(0, performance.now() - lastTick.current))
      : 0;
  function setPrefs(next: Partial<Preferences>) {
    p.preferences = { ...p.preferences, ...next };
    sound.setPreferences({ ...p.preferences });
    applyAppearance(p.preferences.theme);
    persist();
    refresh();
  }
  prefsRef.current = setPrefs;
  function pause() {
    collect();
    running.current = false;
    lastTick.current = null;
    setPaused(true);
    persist();
    void store.flush().catch(() => {});
  }
  pauseRef.current = pause;
  function resume() {
    if (p.active?.status !== "playing") return;
    setPaused(false);
  }
  function closeSheet() {
    setSheet("");
  }
  function stopGeneration() {
    clearTimeout(generationDeadline.current);
    generationDeadline.current = undefined;
    worker.current?.terminate();
    worker.current = null;
    setBusy(false);
  }
  function menu() {
    pause();
    stopGeneration();
    setSheet("");
    setScreen("menu");
  }
  useEffect(() => {
    const unlock = () => {
      void sound.unlock();
    };
    ["pointerdown", "pointerup", "touchend"].forEach((event) =>
      document.addEventListener(event, unlock, { passive: true }),
    );
    document.addEventListener("keydown", unlock);
    const visibility = () => {
      if (document.hidden) {
        stopGeneration();
        pauseRef.current();
      }
      sound.background(document.hidden);
      if (document.hidden) void store.flush().catch(() => {});
    };
    const hide = () => {
      stopGeneration();
      pauseRef.current();
      sound.background(true);
      void store.flush().catch(() => {});
    };
    document.addEventListener("visibilitychange", visibility);
    const show = () => {
      if (!document.hidden) sound.background(false);
    };
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    const media = matchMedia("(prefers-color-scheme: dark)"),
      appearance = () => applyAppearance(p.preferences.theme);
    media.addEventListener("change", appearance);
    applyAppearance(p.preferences.theme);
    return () => {
      ["pointerdown", "pointerup", "touchend"].forEach((event) =>
        document.removeEventListener(event, unlock),
      );
      document.removeEventListener("keydown", unlock);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
      media.removeEventListener("change", appearance);
      clearTimeout(generationDeadline.current);
      worker.current?.terminate();
      sound.dispose();
      store.db?.close();
    };
  }, []);
  const active =
    !phoneLandscape() &&
    screen === "game" &&
    !paused &&
    !sheet &&
    !busy &&
    a?.status === "playing" &&
    !document.hidden;
  useEffect(() => {
    if (active) {
      running.current = true;
      lastTick.current = performance.now();
      const t = setInterval(persist, 5000);
      return () => {
        collect();
        lastTick.current = null;
        running.current = false;
        clearInterval(t);
      };
    }
    collect();
    lastTick.current = null;
    running.current = false;
  }, [active, a?.id]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if (e.key === "Escape" && !sheet && screen === "game") {
        e.preventDefault();
        pauseRef.current();
      }
      if (
        active &&
        (e.key.toLowerCase() === "m" || e.key.toLowerCase() === "e")
      ) {
        p.active!.mode = e.key.toLowerCase() === "m" ? 0 : 1;
        persist();
        refresh();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [sheet, screen, active]);
  function requestNew() {
    if (busy) return;
    pause();
    if (p.active?.status === "playing") setSheet("replace");
    else setScreen("difficulty");
  }
  function discardPrevious() {
    p.active = null;
    persist();
    setSheet("");
    setScreen("difficulty");
  }
  function generate(
    selection: Difficulty | "random",
    rules: Rules = p.preferences.rules,
  ) {
    collect();
    lastTick.current = null;
    running.current = false;
    stopGeneration();
    const d =
      selection === "random"
        ? (Object.keys(SIZES) as Difficulty[])[
            crypto.getRandomValues(new Uint32Array(1))[0] % 4
          ]
        : selection;
    setSheet("");
    setBusy(true);
    setError("");
    let w: Worker;
    try {
      w = new Worker(new URL("./generator.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch {
      setBusy(false);
      setError("Could not prepare a puzzle. Try again.");
      return;
    }
    worker.current = w;
    const done = () => {
      clearTimeout(generationDeadline.current);
      generationDeadline.current = undefined;
      w.terminate();
      if (worker.current === w) worker.current = null;
      setBusy(false);
    };
    w.onerror = (event) => {
      event.preventDefault();
      if (worker.current !== w) return;
      done();
      setError("Could not prepare a puzzle. Try again.");
    };
    w.onmessage = ({ data }) => {
      if (worker.current !== w) return;
      if (data.error) {
        done();
        setError(data.error);
        return;
      }
      p.active = newAttempt(
        data.puzzle,
        selection === "random" ? "random" : "fixed",
        rules,
      );
      done();
      setPaused(false);
      setScreen("game");
      sound.effect("start");
      persist();
      refresh();
    };
    const seed = Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) =>
      x.toString(16).padStart(2, "0"),
    ).join("");
    generationDeadline.current = setTimeout(() => {
      if (worker.current !== w) return;
      done();
      setError("Could not prepare a puzzle. Try again.");
    }, 6000);
    try {
      w.postMessage({ difficulty: d, seed });
    } catch {
      done();
      setError("Could not prepare a puzzle. Try again.");
    }
  }
  function move(i: number) {
    if (!running.current || !a) return;
    collect();
    const before = groups(clues(a.puzzle)).filter((g) =>
        g.members.every((j) => a.cells[j]),
      ).length,
      result = play(a, i);
    if (result === "ignored") return;
    if (result === "mistake") setMistake({ index: i, id: performance.now() });
    const after = groups(clues(a.puzzle)).filter((g) =>
      g.members.every((j) => a.cells[j]),
    ).length;
    sound.effect(
      a.status === "lost"
        ? "lose"
        : a.status === "won"
          ? "win"
          : result === "mistake"
            ? "mistake"
            : after > before
              ? "clear"
              : result,
    );
    if (p.preferences.haptics && navigator.vibrate)
      navigator.vibrate(result === "mistake" ? [20, 30, 20] : 8);
    if (a.status !== "playing") {
      lastTick.current = null;
      running.current = false;
      finalize(p);
    }
    persist();
    refresh();
  }
  function restart() {
    if (!a) return;
    collect();
    lastTick.current = null;
    p.active = newAttempt(a.puzzle, a.selection, a.rules);
    sound.effect("start");
    setPaused(false);
    persist();
    refresh();
  }
  function mode(value: 0 | 1) {
    if (!a || a.status !== "playing" || a.mode === value) return;
    a.mode = value;
    persist();
    refresh();
  }
  const open = (s: Sheet) => {
    setSheet(s);
    sound.effect("tap");
  };
  const statsMap = statsRules === "standard" ? p.stats : p.relaxedStats;
  const sumStats = (map: Record<string, Stats>) =>
    Object.values(map).reduce(
      (sum, s) => ({
        completed_ids: [...sum.completed_ids, ...s.completed_ids],
        generated_completed: sum.generated_completed + s.generated_completed,
        wins: sum.wins + s.wins,
        losses: sum.losses + s.losses,
        total_win_ms: sum.total_win_ms + s.total_win_ms,
        playtime_ms: sum.playtime_ms + s.playtime_ms,
        best_win_ms:
          s.best_win_ms < 0
            ? sum.best_win_ms
            : sum.best_win_ms < 0
              ? s.best_win_ms
              : Math.min(sum.best_win_ms, s.best_win_ms),
      }),
      emptyStats(),
    );
  const allStats = sumStats(statsMap);
  const homeCompleted =
    completed(sumStats(p.stats)) + completed(sumStats(p.relaxedStats));
  const stats: Stats =
    statsCategory === "all"
      ? allStats
      : (statsMap[statsCategory] ?? emptyStats());
  return (
    <main
      className={"app " + (p.preferences.reduceMotion ? "reduce-motion" : "")}
    >
      {screen === "menu" ? (
        <section className="menu content">
          <div className="home-middle">
            <div className="home-group">
              <header className="brand-row">
                <div className="brand" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <div>
                  <FullscreenButton />
                  <button
                    className="icon"
                    aria-label="Settings"
                    onClick={() => open("settings")}
                  >
                    <Icon name="settings" />
                  </button>
                </div>
              </header>
              <h1>Number Sums</h1>
              <p className="tagline">Find the numbers that make each sum.</p>
              <p className="completed-count">
                {homeCompleted} puzzles completed
              </p>
              <div className="menu-actions">
                {a?.status === "playing" && (
                  <button
                    className="primary"
                    onClick={() => {
                      setScreen("game");
                      resume();
                    }}
                  >
                    Continue puzzle{" "}
                    <small>
                      {title(a.puzzle.difficulty)}
                      {a.rules === "relaxed" ? " · Relaxed" : ""} ·{" "}
                      {time(a.elapsed)}
                    </small>
                  </button>
                )}
                <button
                  className={a?.status === "playing" ? "secondary" : "primary"}
                  onClick={requestNew}
                >
                  New game
                </button>
              </div>
              <nav className="home-nav">
                <button onClick={() => open("stats")}>Statistics</button>
                <button
                  onClick={() => {
                    open("help");
                  }}
                >
                  How to play
                </button>
              </nav>
              <div className="menu-footer">
                <OfflineStatus
                  offline={offline}
                  onRefresh={() => void offline.refresh(save)}
                />
              </div>
            </div>
          </div>
        </section>
      ) : screen === "difficulty" ? (
        <div className="selection-middle">
          <section className="difficulty content selection-group">
            <header className="brand-row">
              <button className="icon" aria-label="Back to menu" onClick={menu}>
                <Icon name="back" />
              </button>
              <button
                className="icon"
                aria-label="Settings"
                onClick={() => open("settings")}
              >
                <Icon name="settings" />
              </button>
            </header>
            <h1>Choose a puzzle</h1>
            <p className="intro">Four sizes. No time limit.</p>
            <div className="difficulty-list">
              {(
                ["random", ...Object.keys(SIZES)] as (Difficulty | "random")[]
              ).map((d) => (
                <button
                  className="difficulty-row"
                  key={d}
                  disabled={busy}
                  onClick={() => generate(d)}
                >
                  <span>
                    <strong>{title(d)}</strong>
                    <small>
                      {d === "random"
                        ? "A different size each time"
                        : `${SIZES[d]} × ${SIZES[d]} squares`}
                    </small>
                  </span>
                  <span aria-hidden="true">›</span>
                </button>
              ))}
            </div>
            <div className="difficulty-rules">
              <Toggle
                label="Relaxed mode"
                value={p.preferences.rules === "relaxed"}
                disabled={busy}
                detail="No life limit. Applies to your next puzzle."
                onChange={() =>
                  setPrefs({
                    rules:
                      p.preferences.rules === "relaxed"
                        ? "standard"
                        : "relaxed",
                  })
                }
              />
            </div>
          </section>
        </div>
      ) : (
        a && (
          <section className="game content">
            <div className="game-viewport">
              <div className="game-group">
                <header className="game-header">
                  <button
                    className="icon"
                    aria-label="Back to menu"
                    onClick={menu}
                  >
                    <Icon name="back" />
                  </button>
                  <strong>
                    {title(a.puzzle.difficulty)}
                    {a.rules === "relaxed" ? " · Relaxed" : ""}
                  </strong>
                  <div>
                    <button
                      className="icon"
                      aria-label="Pause puzzle"
                      disabled={a.status !== "playing"}
                      onClick={pause}
                    >
                      <Icon name="pause" />
                    </button>
                    <button
                      className="icon"
                      aria-label="How to play"
                      onClick={() => {
                        open("help");
                      }}
                    >
                      <Icon name="help" />
                    </button>
                  </div>
                </header>
                <div className="game-body">
                  <div className="game-meta">
                    <span
                      className="hearts"
                      aria-label={
                        a.rules === "relaxed"
                          ? "No life limit"
                          : `${a.lives} lives`
                      }
                    >
                      {a.rules === "relaxed" ? (
                        <span className="relaxed-label">No life limit</span>
                      ) : (
                        <>
                          {[0, 1, 2].map((i) => (
                            <span
                              className={i < a.lives ? "" : "empty"}
                              key={i}
                            >
                              <Icon name="heart" size={26} />
                            </span>
                          ))}
                        </>
                      )}
                    </span>
                    <span
                      className="grid-size"
                      aria-label={`${a.puzzle.size} by ${a.puzzle.size} grid`}
                    >
                      {a.puzzle.size} × {a.puzzle.size}
                    </span>
                    <Clock get={getElapsed} running={!!active} />
                  </div>
                  <Board
                    attempt={a}
                    onMove={move}
                    paused={!active}
                    mistake={mistake?.index ?? null}
                  />
                  <div className="progress">
                    <span>Numbers resolved</span>
                    <span>
                      {a.cells.filter(Boolean).length} / {a.cells.length}
                    </span>
                    <progress
                      max={a.cells.length}
                      value={a.cells.filter(Boolean).length}
                    />
                  </div>
                  <div className="mode" role="group" aria-label="Mark or erase">
                    <span
                      className={"mode-thumb " + (a.mode === 0 ? "right" : "")}
                      aria-hidden="true"
                    />
                    <button
                      aria-pressed={a.mode === 1}
                      onClick={() => mode(1)}
                      disabled={a.status !== "playing"}
                    >
                      Erase
                    </button>
                    <button
                      aria-pressed={a.mode === 0}
                      onClick={() => mode(0)}
                      disabled={a.status !== "playing"}
                    >
                      Mark
                    </button>
                  </div>
                  {(paused || a.status !== "playing") && !sheet && !busy && (
                    <div className="game-overlay">
                      <div className="pause-card">
                        <span className="eyebrow">
                          {a.status === "won"
                            ? "Nicely solved"
                            : a.status === "lost"
                              ? "Out of lives"
                              : "Take your time"}
                        </span>
                        <h2>
                          {a.status === "won"
                            ? "Puzzle complete"
                            : a.status === "lost"
                              ? "Try again"
                              : "Paused"}
                        </h2>
                        {a.status === "playing" ? (
                          <>
                            <button className="primary" onClick={resume}>
                              Resume
                            </button>
                            <button className="secondary" onClick={restart}>
                              Restart puzzle
                            </button>
                            <button className="text-button" onClick={menu}>
                              Home
                            </button>
                          </>
                        ) : (
                          <>
                            <p>
                              {a.status === "won"
                                ? `Solved in ${time(a.elapsed)}.`
                                : "A fresh attempt, the same puzzle."}
                            </p>
                            <button
                              className="primary"
                              onClick={() =>
                                generate(
                                  a.selection === "random"
                                    ? "random"
                                    : a.puzzle.difficulty === "custom"
                                      ? ((
                                          Object.keys(SIZES) as Difficulty[]
                                        ).find(
                                          (d) => SIZES[d] === a.puzzle.size,
                                        ) ?? "easy")
                                      : a.puzzle.difficulty,
                                )
                              }
                            >
                              Next puzzle
                            </button>
                            <button className="secondary" onClick={restart}>
                              Replay puzzle
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button aria-label="Dismiss notice" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}
      {(error || offline.error) && (
        <div className="notice error" role="alert">
          {error || offline.error}
          <button
            onClick={() => {
              setError("");
              offline.dismissError();
            }}
          >
            Dismiss
          </button>
        </div>
      )}
      {busy && (
        <Dialog title="Preparing your puzzle" onClose={menu}>
          <div className="loading-puzzle">
            <span className="loading-dots" />
            Finding a fresh puzzle with one solution.
          </div>
          <button className="secondary" onClick={menu}>
            Cancel
          </button>
        </Dialog>
      )}
      {sheet && (
        <Dialog
          title={
            {
              settings: "Settings",
              help: "How to play",
              stats: "Statistics",
              replace: "Start a new puzzle?",
            }[sheet]
          }
          onClose={closeSheet}
        >
          {sheet === "replace" && (
            <>
              <p className="intro">
                Continue your saved puzzle, or discard it to choose a new one.
                Your statistics are kept.
              </p>
              <button
                className="primary"
                onClick={() => {
                  closeSheet();
                  setScreen("game");
                  resume();
                }}
              >
                Continue puzzle
              </button>
              <button className="secondary" onClick={discardPrevious}>
                Discard previous run
              </button>
            </>
          )}
          {sheet === "stats" && (
            <>
              <div
                className="filter-tabs"
                role="group"
                aria-label="Statistics game mode"
              >
                {(["standard", "relaxed"] as Rules[]).map((rule) => (
                  <button
                    key={rule}
                    aria-pressed={statsRules === rule}
                    onClick={() => setStatsRules(rule)}
                  >
                    {title(rule)}
                  </button>
                ))}
              </div>
              <label className="select-label">
                Difficulty
                <select
                  aria-label="Statistics difficulty"
                  value={statsCategory}
                  onChange={(e) => setStatsCategory(e.target.value)}
                >
                  {["all", ...Object.keys(statsMap)].map((d) => (
                    <option key={d} value={d}>
                      {d === "all" ? "All difficulties" : title(d)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="stats-grid">
                {[
                  ["Completed", completed(stats)],
                  ["Wins", stats.wins],
                  ["Losses", stats.losses],
                  [
                    "Average time",
                    stats.wins ? time(stats.total_win_ms / stats.wins) : "-",
                  ],
                  [
                    "Best time",
                    stats.best_win_ms >= 0 ? time(stats.best_win_ms) : "-",
                  ],
                  ["Total playtime", time(stats.playtime_ms)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <strong>{value}</strong>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
              <p className="fine-print">
                Replays count as wins. Completed counts each puzzle once. Time
                counts only while you play.
              </p>
            </>
          )}
          {sheet === "settings" && (
            <div className="settings-panel settings-single">
              <span className="setting-label">Appearance</span>
              <div
                className="theme-options"
                role="group"
                aria-label="Appearance"
              >
                {(["system", "light", "dark"] as const).map((theme) => (
                  <button
                    key={theme}
                    className={p.preferences.theme === theme ? "selected" : ""}
                    aria-pressed={p.preferences.theme === theme}
                    onClick={() => setPrefs({ theme })}
                  >
                    {title(theme)}
                  </button>
                ))}
              </div>
              <Toggle
                label="Reduce motion"
                value={p.preferences.reduceMotion}
                onChange={() =>
                  setPrefs({ reduceMotion: !p.preferences.reduceMotion })
                }
              />
              <Toggle
                label="Sound effects"
                value={p.preferences.effects}
                onChange={() => setPrefs({ effects: !p.preferences.effects })}
              />
              <Volume
                label="Effects volume"
                value={p.preferences.effectsVolume}
                onChange={(effectsVolume) => setPrefs({ effectsVolume })}
              />
              {"vibrate" in navigator && (
                <Toggle
                  label="Haptic feedback"
                  value={p.preferences.haptics}
                  onChange={() => setPrefs({ haptics: !p.preferences.haptics })}
                />
              )}
              <div className="settings-footer">
                <OfflineStatus
                  offline={offline}
                  onRefresh={() => void offline.refresh(save)}
                />
                <p className="fine-print">
                  Progress and statistics stay on this device.
                </p>
              </div>
            </div>
          )}
          {sheet === "help" && (
            <Tutorial
              onFinish={() => {
                setPrefs({ tutorialSeen: true });
                closeSheet();
                if (a?.status === "playing") {
                  setScreen("game");
                  resume();
                } else {
                  pause();
                  setScreen("difficulty");
                }
              }}
            />
          )}
        </Dialog>
      )}
      <PortraitGuard onRotate={() => pauseRef.current()} />
    </main>
  );
}
