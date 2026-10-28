import { describe, it, expect } from "vitest";
import {
  generate,
  clues,
  solve,
  deduce,
  accepts,
  validPuzzle,
  groups,
  type Difficulty,
} from "../src/core/puzzle";
import {
  freshProfile,
  migrateLegacy,
  newAttempt,
  play,
  finalize,
  validateProfile,
  completed,
} from "../src/core/profile";
import authored from "../src/core/authored.json";
const difficulties: Difficulty[] = ["beginner", "easy", "medium", "hard"];
describe("ported independent puzzle rules", () => {
  for (const d of difficulties)
    it(`${d}: 25 fresh boards retain uniqueness and deduction difficulty`, () => {
      for (let i = 0; i < 25; i++) {
        const p = generate(d, (i + 301).toString(16).padStart(32, "0"));
        expect(validPuzzle(p)).toBe(true);
        expect(accepts(d, deduce(clues(p)))).toBe(true);
        const r = solve(clues(p));
        expect(r.complete).toBe(true);
        expect(r.count).toBe(1);
        expect(r.solution).toEqual(p.answer);
        for (const g of groups(clues(p)))
          expect(
            g.members.some((i) => p.answer[i]) &&
              g.members.some((i) => !p.answer[i]),
          ).toBe(true);
      }
    }, 30000);
  it("detects a second solution without consulting an answer", () => {
    const c = {
      size: 2,
      values: [1, 1, 1, 1],
      regions: [-1, -1, -1, -1],
      rows: [1, 1],
      columns: [1, 1],
      groups: [],
    };
    expect(solve(c).count).toBe(2);
    expect(solve(c, 0).complete).toBe(false);
  });
  it("marks/erases correctly, locks resolved answers and finalizes once", () => {
    const p = freshProfile(),
      board = generate("easy", "a".repeat(32));
    p.active = newAttempt(board);
    const a = p.active;
    let i = 0;
    a.mode = board.answer[i] ? 1 : 0;
    expect(play(a, i)).toBe("mistake");
    expect(a.lives).toBe(2);
    expect(a.cells[i]).toBe(0);
    board.answer.forEach((v, i) => {
      a.mode = v ? 0 : 1;
      expect(play(a, i)).toBe(v ? "fill" : "cross");
      expect(play(a, i)).toBe("ignored");
    });
    expect(a.status).toBe("won");
    a.elapsed = 12400;
    finalize(p);
    finalize(p);
    expect(p.stats.easy.wins).toBe(1);
    expect(completed(p.stats.easy)).toBe(1);
    expect(p.stats.easy.best_win_ms).toBe(12400);
    p.active = newAttempt(a.puzzle);
    p.active.puzzle.answer.forEach((v, i) => {
      p.active!.mode = v ? 0 : 1;
      play(p.active!, i);
    });
    finalize(p);
    expect(p.stats.easy.wins).toBe(2);
    expect(completed(p.stats.easy)).toBe(1);
    expect(validateProfile(p)).not.toBeNull();
  });
  it("three mistakes end the attempt; restarting/replacing is not a loss", () => {
    const p = freshProfile();
    p.active = newAttempt(generate("beginner", "b".repeat(32)));
    const a = p.active;
    a.mode = a.puzzle.answer[0] ? 1 : 0;
    play(a, 0);
    play(a, 0);
    expect(a.status).toBe("playing");
    play(a, 0);
    expect(a.status).toBe("lost");
    expect(play(a, 1)).toBe("ignored");
    finalize(p);
    expect(p.stats.beginner.losses).toBe(1);
    p.active = newAttempt(a.puzzle);
    expect(p.stats.beginner.losses).toBe(1);
  });
  it("migrates legacy generated snapshot/settings/timing without losing historical totals", () => {
    const board = generate("medium", "c".repeat(32)),
      old = {
        version: 1,
        stats: {
          medium: {
            completed_ids: ["old"],
            generated_completed: 7,
            wins: 10,
            losses: 2,
            total_win_ms: 123456,
            best_win_ms: 3000,
            playtime_ms: 555555,
          },
        },
        last_result_id: "old",
        preferences: {
          appearance: "dark",
          reduce_motion: true,
          music_enabled: false,
          sound_enabled: false,
          music_volume: 0.22,
          music_volume_revision: 1,
          effects_volume: 0.61,
          music_shuffle: false,
          music_track: "sunroom",
          haptics_enabled: true,
        },
        active: {
          puzzle_id: board.id,
          attempt_id: "active",
          generated_puzzle: board,
          cells: board.values.map((_, i) =>
            i === 0 ? (board.answer[i] ? 1 : 2) : 0,
          ),
          lives: 1,
          mode: 1,
          elapsed_ms: 16000,
          selection_mode: "random",
        },
      };
    const p = migrateLegacy(old);
    expect(p.active?.puzzle).toEqual(board);
    expect(p.active?.elapsed).toBe(16000);
    expect(p.active?.selection).toBe("random");
    expect(p.stats.medium).toEqual(old.stats.medium);
    expect(p.preferences).toMatchObject({
      theme: "dark",
      reduceMotion: true,
      effects: false,
      effectsVolume: 0.61,
      haptics: true,
    });
    for (const key of ["music", "musicVolume", "shuffle", "track"])
      expect(p.preferences).not.toHaveProperty(key);
  });
  it("migrates every authored board and rejects invalid progress instead of wiping it", () => {
    for (const board of authored) {
      const old = {
        version: 1,
        stats: {},
        active: {
          puzzle_id: board.id,
          attempt_id: "active",
          cells: board.values.map(() => 0),
          lives: 2,
          mode: 0,
          elapsed_ms: 0,
        },
      };
      expect(migrateLegacy(old).active?.puzzle.id).toBe(board.id);
      old.active.cells[0] = board.answer[0] ? 2 : 1;
      expect(() => migrateLegacy(old)).toThrow();
    }
  });
  it("rejects malformed migrated data and corrupted current profiles", () => {
    const p = freshProfile();
    expect(validateProfile(p)).not.toBeNull();
    p.preferences.effectsVolume = 999;
    expect(validateProfile(p)).toBeNull();
    expect(() =>
      migrateLegacy({ version: 1, stats: { easy: { wins: -2 } }, active: {} }),
    ).toThrow();
  });
});

describe("Standard and Relaxed compatibility", () => {
  const puzzle = () => generate("beginner", "00000000000000000000000000000911");
  it("normalizes old browser saves without resetting progress or statistics", () => {
    const old = freshProfile();
    old.active = newAttempt(puzzle());
    old.active.elapsed = 3500;
    old.stats.easy.playtime_ms = 4200;
    const copy = JSON.parse(JSON.stringify(old));
    delete copy.preferences.rules;
    delete copy.active.rules;
    delete copy.relaxedStats;
    const normalized = validateProfile(copy)!;
    expect(normalized.preferences.rules).toBe("standard");
    expect(normalized.active!.rules).toBe("standard");
    expect(normalized.active!.id).toBe(old.active.id);
    expect(normalized.active!.elapsed).toBe(3500);
    expect(normalized.stats).toEqual(old.stats);
    expect(normalized.relaxedStats.easy.wins).toBe(0);
    copy.active.rules = "invalid";
    expect(validateProfile(copy)).toBeNull();
    copy.active.rules = null;
    expect(validateProfile(copy)).toBeNull();
  });
  it("standard loses on the third mistake; relaxed never consumes lives", () => {
    for (const rule of ["standard", "relaxed"] as const) {
      const a = newAttempt(puzzle(), "fixed", rule);
      a.mode = a.puzzle.answer[0] ? 1 : 0;
      expect(a.lives).toBe(3);
      play(a, 0);
      play(a, 0);
      expect(a.status).toBe("playing");
      expect(a.lives).toBe(rule === "standard" ? 1 : 3);
      for (let i = 0; i < 6; i++) play(a, 0);
      expect(a.cells[0]).toBe(0);
      expect(a.status).toBe(rule === "standard" ? "lost" : "playing");
      expect(a.lives).toBe(rule === "standard" ? 0 : 3);
    }
  });
  it("locks correct relaxed answers and finalizes into separate statistics once", () => {
    const p = freshProfile();
    p.active = newAttempt(puzzle(), "random", "relaxed");
    for (let i = 0; i < p.active.cells.length; i++) {
      p.active.mode = p.active.puzzle.answer[i] ? 0 : 1;
      play(p.active, i);
      expect(play(p.active, i)).toBe("ignored");
    }
    p.active.elapsed = 1234;
    finalize(p);
    finalize(p);
    expect(p.relaxedStats.beginner.wins).toBe(1);
    expect(p.relaxedStats.beginner.total_win_ms).toBe(1234);
    expect(p.stats.beginner.wins).toBe(0);
    expect(validateProfile(p)).not.toBeNull();
  });
  it("a future preference does not alter an active attempt or its replay rules", () => {
    const p = freshProfile();
    p.active = newAttempt(puzzle());
    p.preferences.rules = "relaxed";
    expect(p.active.rules).toBe("standard");
    const replay = newAttempt(
      p.active.puzzle,
      p.active.selection,
      p.active.rules,
    );
    expect(replay.rules).toBe("standard");
    expect(newAttempt(puzzle(), "fixed", p.preferences.rules).rules).toBe(
      "relaxed",
    );
  });
});
