import { SaveScheduler } from "./saveScheduler";
import authored from "./authored.json";
import { validPuzzle, clues, solve, type Puzzle } from "./puzzle";
export type Rules = "standard" | "relaxed";
export interface Preferences {
  rules: Rules;
  theme: "system" | "light" | "dark";
  reduceMotion: boolean;
  effects: boolean;
  effectsVolume: number;
  tutorialSeen: boolean;
  haptics: boolean;
}
export interface Stats {
  completed_ids: string[];
  generated_completed: number;
  wins: number;
  losses: number;
  total_win_ms: number;
  best_win_ms: number;
  playtime_ms: number;
}
export interface Attempt {
  rules: Rules;
  puzzle: Puzzle;
  id: string;
  cells: number[];
  lives: number;
  mode: 0 | 1;
  elapsed: number;
  selection: "fixed" | "random";
  status: "playing" | "won" | "lost";
  counted: boolean;
}
export interface Profile {
  version: 2;
  active: Attempt | null;
  preferences: Preferences;
  stats: Record<string, Stats>;
  relaxedStats: Record<string, Stats>;
  lastResult: string;
}
export const emptyStats = (): Stats => ({
  completed_ids: [],
  generated_completed: 0,
  wins: 0,
  losses: 0,
  total_win_ms: 0,
  best_win_ms: -1,
  playtime_ms: 0,
});
export const freshProfile = (): Profile => ({
  version: 2,
  active: null,
  preferences: {
    rules: "standard",
    theme: "system",
    reduceMotion: false,
    effects: true,
    effectsVolume: 1,
    tutorialSeen: false,
    haptics: false,
  },
  stats: Object.fromEntries(
    ["beginner", "easy", "medium", "hard"].map((d) => [d, emptyStats()]),
  ),
  relaxedStats: Object.fromEntries(
    ["beginner", "easy", "medium", "hard"].map((d) => [d, emptyStats()]),
  ),
  lastResult: "",
});
export const completed = (s: Stats) =>
  s.completed_ids.length + s.generated_completed;
export function validAttempt(a: Attempt): boolean {
  return (
    !!a &&
    ["standard", "relaxed"].includes(a.rules) &&
    validPuzzle(a.puzzle) &&
    typeof a.id === "string" &&
    a.id.length > 0 &&
    Array.isArray(a.cells) &&
    a.cells.length === a.puzzle.size ** 2 &&
    a.cells.every(
      (v, i) =>
        v === 0 ||
        (v === 1 && a.puzzle.answer[i]) ||
        (v === 2 && !a.puzzle.answer[i]),
    ) &&
    [0, 1].includes(a.mode) &&
    ["fixed", "random"].includes(a.selection) &&
    Number.isInteger(a.lives) &&
    a.lives >= 0 &&
    a.lives <= 3 &&
    Number.isFinite(a.elapsed) &&
    a.elapsed >= 0 &&
    typeof a.counted === "boolean" &&
    ["playing", "won", "lost"].includes(a.status) &&
    (a.status !== "playing" || (a.lives > 0 && a.cells.some((v) => v === 0))) &&
    (a.status !== "won" || a.cells.every(Boolean)) &&
    (a.status !== "lost" || (a.rules === "standard" && a.lives === 0))
  );
}
export function validateProfile(input: unknown): Profile | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Profile;
  const p: Profile = {
    ...raw,
    preferences: raw.preferences
      ? {
          ...raw.preferences,
          rules:
            raw.preferences.rules === undefined
              ? "standard"
              : raw.preferences.rules,
        }
      : raw.preferences,
    active: raw.active
      ? {
          ...raw.active,
          rules: raw.active.rules === undefined ? "standard" : raw.active.rules,
        }
      : raw.active,
    relaxedStats:
      raw.relaxedStats === undefined
        ? freshProfile().relaxedStats
        : raw.relaxedStats,
  };
  if (
    p.version !== 2 ||
    !p.preferences ||
    !p.stats ||
    typeof p.stats !== "object" ||
    typeof p.lastResult !== "string"
  )
    return null;
  const pref = p.preferences;
  if (
    !["standard", "relaxed"].includes(pref.rules) ||
    !["system", "light", "dark"].includes(pref.theme) ||
    ![pref.effectsVolume].every(
      (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1,
    ) ||
    ![pref.reduceMotion, pref.effects, pref.tutorialSeen, pref.haptics].every(
      (v) => typeof v === "boolean",
    )
  )
    return null;
  if (!p.relaxedStats || typeof p.relaxedStats !== "object") return null;
  for (const [d, s] of [
    ...Object.entries(p.stats),
    ...Object.entries(p.relaxedStats),
  ]) {
    if (
      !["beginner", "easy", "medium", "hard", "custom"].includes(d) ||
      !s ||
      !Array.isArray(s.completed_ids) ||
      !s.completed_ids.every((v) => typeof v === "string") ||
      ![
        s.generated_completed,
        s.wins,
        s.losses,
        s.total_win_ms,
        s.playtime_ms,
      ].every((v) => Number.isSafeInteger(v) && v >= 0) ||
      !Number.isSafeInteger(s.best_win_ms) ||
      s.best_win_ms < -1 ||
      completed(s) > s.wins
    )
      return null;
  }
  if (
    !["beginner", "easy", "medium", "hard"].every(
      (d) => p.stats[d] && p.relaxedStats[d],
    ) ||
    (p.active !== null && !validAttempt(p.active))
  )
    return null;
  return {
    ...p,
    preferences: {
      rules: pref.rules,
      theme: pref.theme,
      reduceMotion: pref.reduceMotion,
      effects: pref.effects,
      effectsVolume: pref.effectsVolume,
      tutorialSeen: pref.tutorialSeen,
      haptics: pref.haptics,
    },
  };
}
export function migrateLegacy(x: unknown): Profile {
  if (!x || typeof x !== "object")
    throw Error("Your previous save could not be read.");
  const old = x as Record<string, any>;
  if (
    old.version !== 1 ||
    !old.stats ||
    !old.active ||
    typeof old.active !== "object"
  )
    throw Error("Your previous save is invalid.");
  const p = freshProfile(),
    s = old.preferences ?? {};
  p.preferences = {
    rules: "standard",
    theme: s.appearance ?? "system",
    reduceMotion: s.reduce_motion ?? false,
    effects: s.sound_enabled ?? true,
    effectsVolume: s.effects_volume ?? 1,
    tutorialSeen: s.onboarding_seen ?? true,
    haptics: s.haptics_enabled ?? false,
  };
  p.lastResult = old.last_result_id ?? "";
  for (const [d, stat] of Object.entries(old.stats))
    p.stats[d] = { ...emptyStats(), ...(stat as Stats) };
  const a = old.active;
  if (Object.keys(a).length) {
    const puzzle =
      a.generated_puzzle ??
      (authored as Puzzle[]).find((p) => p.id === a.puzzle_id);
    if (!validPuzzle(puzzle))
      throw Error(
        "Your saved puzzle could not be restored. Your old save has been preserved.",
      );
    if (puzzle.generated) {
      const r = solve(clues(puzzle));
      if (
        !r.complete ||
        r.count !== 1 ||
        r.solution.some((v, i) => v !== puzzle.answer[i])
      )
        throw Error("The saved puzzle failed its solution check.");
    }
    p.active = {
      rules: "standard",
      puzzle: structuredClone(puzzle),
      id: a.attempt_id,
      cells: a.cells,
      lives: a.lives,
      mode: a.mode,
      elapsed: a.elapsed_ms,
      selection: a.selection_mode ?? "fixed",
      status: "playing",
      counted: false,
    };
  }
  if (!validateProfile(p))
    throw Error("Your previous save failed validation. It has been preserved.");
  return p;
}
/** Read-only migration of Emscripten IDBFS. Never delete or modify the old DB. */
async function legacyProfile(): Promise<Profile | null> {
  const existing = await new Promise<IDBDatabase | null>((resolve, reject) => {
    const r = indexedDB.open("/userfs");
    let absent = false;
    r.onupgradeneeded = () => {
      absent = true;
      r.transaction!.abort();
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => (absent ? resolve(null) : reject(r.error));
    r.onblocked = () =>
      reject(Error("Close other Number Sums tabs before updating."));
  });
  if (!existing) return null;
  try {
    if (!existing.objectStoreNames.contains("FILE_DATA")) return null;
    const entries = await new Promise<{ path: string; data: any }[]>(
      (resolve, reject) => {
        const tx = existing.transaction("FILE_DATA", "readonly"),
          out: { path: string; data: any }[] = [];
        const r = tx.objectStore("FILE_DATA").openCursor();
        r.onsuccess = () => {
          const c = r.result;
          if (c) {
            if (/\/profile\.json(?:\.bak)?$/.test(String(c.key)))
              out.push({ path: String(c.key), data: c.value });
            c.continue();
          }
        };
        tx.oncomplete = () => resolve(out);
        tx.onerror = () => reject(tx.error);
      },
    );
    if (!entries.length) return null;
    entries.sort(
      (a, b) =>
        Number(a.path.endsWith(".bak")) - Number(b.path.endsWith(".bak")) ||
        new Date(b.data.timestamp).getTime() -
          new Date(a.data.timestamp).getTime(),
    );
    for (const e of entries) {
      try {
        return migrateLegacy(
          JSON.parse(new TextDecoder().decode(e.data.contents)),
        );
      } catch {
        /* Try original engine backup without mutating it. */
      }
    }
    throw Error(
      "Your previous save could not be read. It is still stored safely. Please keep this browser’s site data.",
    );
  } finally {
    existing.close();
  }
}
export class ProfileStore {
  db: IDBDatabase | null = null;
  notice = "";
  private writer = new SaveScheduler<Profile>((copy) => this.write(copy));
  flush() {
    return this.writer.flush();
  }
  async open(): Promise<Profile> {
    this.db = await new Promise((resolve, reject) => {
      const r = indexedDB.open("number-sums-browser-profile", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("profile");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const values = await new Promise<unknown[]>((resolve, reject) => {
      const tx = this.db!.transaction("profile"),
        s = tx.objectStore("profile"),
        a = s.get("current"),
        b = s.get("backup");
      tx.oncomplete = () => resolve([a.result, b.result]);
      tx.onerror = () => reject(tx.error);
    });
    if (values[0] !== undefined) {
      const current = validateProfile(values[0]);
      if (current) {
        await this.save(current);
        return current;
      }
      const backup = validateProfile(values[1]);
      if (!backup)
        throw Error(
          "Your save could not be read. Its data has been preserved.",
        );
      this.notice = "Your save was recovered from its backup.";
      await this.save(backup);
      return backup;
    }
    const legacy = await legacyProfile(),
      p = legacy ?? freshProfile();
    await this.save(p);
    if (legacy)
      this.notice =
        "Your saved puzzle, statistics and settings have been carried over.";
    return p;
  }
  save(profile: Profile) {
    return this.writer.save(profile);
  }
  private write(copy: Profile): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Storage unavailable"));
        return;
      }
      const tx = this.db.transaction("profile", "readwrite"),
        s = tx.objectStore("profile");
      const old = s.get("current");
      old.onsuccess = () => {
        if (validateProfile(old.result)) s.put(old.result, "backup");
        s.put(copy, "current");
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
}

export function newAttempt(
  p: Puzzle,
  selection: "fixed" | "random" = "fixed",
  rules: Rules = "standard",
): Attempt {
  return {
    rules,
    puzzle: structuredClone(p),
    id: crypto.randomUUID(),
    cells: p.values.map(() => 0),
    lives: 3,
    mode: 0,
    elapsed: 0,
    selection,
    status: "playing",
    counted: false,
  };
}
export function play(
  a: Attempt,
  i: number,
): "ignored" | "mistake" | "fill" | "cross" {
  if (
    a.status !== "playing" ||
    !Number.isInteger(i) ||
    i < 0 ||
    i >= a.cells.length ||
    a.cells[i]
  )
    return "ignored";
  if (a.puzzle.answer[i] !== (a.mode === 0)) {
    if (a.rules === "standard" && --a.lives === 0) a.status = "lost";
    return "mistake";
  }
  a.cells[i] = a.mode === 0 ? 1 : 2;
  if (a.cells.every(Boolean)) a.status = "won";
  return a.mode === 0 ? "fill" : "cross";
}
export function finalize(p: Profile) {
  const a = p.active;
  if (!a || a.status === "playing" || a.counted || p.lastResult === a.id)
    return;
  const s = attemptStats(p, a);
  if (a.status === "won") {
    s.wins++;
    s.total_win_ms += a.elapsed;
    s.best_win_ms =
      s.best_win_ms < 0 ? a.elapsed : Math.min(s.best_win_ms, a.elapsed);
    if (a.puzzle.generated) {
      if (!a.puzzle.completed) s.generated_completed++;
      a.puzzle.completed = true;
    } else if (!s.completed_ids.includes(a.puzzle.id))
      s.completed_ids.push(a.puzzle.id);
  } else s.losses++;
  a.counted = true;
  p.lastResult = a.id;
}

export function attemptStats(p: Profile, a: Attempt): Stats {
  const map = a.rules === "relaxed" ? p.relaxedStats : p.stats;
  return (map[a.puzzle.difficulty] ??= emptyStats());
}
