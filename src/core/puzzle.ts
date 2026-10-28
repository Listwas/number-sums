export const SIZES = { beginner: 3, easy: 4, medium: 5, hard: 6 } as const;
export type Difficulty = keyof typeof SIZES;
export interface Puzzle {
  id: string;
  name?: string;
  difficulty: Difficulty | "custom";
  size: number;
  values: number[];
  answer: boolean[];
  regions: number[];
  generated?: boolean;
  completed?: boolean;
  seed?: string;
  generator_version?: number;
}
export interface Clues {
  size: number;
  values: number[];
  regions: number[];
  rows: number[];
  columns: number[];
  groups: number[];
}
export function neighbors(i: number, n: number) {
  return [
    i >= n ? i - n : -1,
    i < n * (n - 1) ? i + n : -1,
    i % n ? i - 1 : -1,
    i % n < n - 1 ? i + 1 : -1,
  ].filter((x) => x >= 0);
}
const whole = (x: unknown, l: number, h: number): x is number =>
  typeof x === "number" && Number.isInteger(x) && x >= l && x <= h;
export function validPuzzle(x: unknown): x is Puzzle {
  if (!x || typeof x !== "object") return false;
  const p = x as Puzzle,
    n = p.size;
  if (
    !whole(n, 1, 6) ||
    typeof p.id !== "string" ||
    !["beginner", "easy", "medium", "hard", "custom"].includes(p.difficulty)
  )
    return false;
  if (
    ![p.values, p.answer, p.regions].every(
      (a) => Array.isArray(a) && a.length === n * n,
    ) ||
    !p.values.every((v) => whole(v, 1, 9)) ||
    !p.answer.every((v) => typeof v === "boolean") ||
    !p.regions.every((v) => whole(v, -1, 5))
  )
    return false;
  for (let g = 0; g <= Math.max(...p.regions); g++) {
    const first = p.regions.indexOf(g);
    if (first < 0) return false;
    const seen = new Set([first]),
      todo = [first];
    while (todo.length)
      for (const i of neighbors(todo.pop()!, n))
        if (p.regions[i] === g && !seen.has(i)) {
          seen.add(i);
          todo.push(i);
        }
    if (seen.size !== p.regions.filter((x) => x === g).length) return false;
  }
  if (p.generated) {
    if (
      !/^[a-f0-9]{32}$/i.test(p.seed ?? "") ||
      ![1, 2, 3].includes(p.generator_version ?? 0) ||
      typeof p.completed !== "boolean"
    )
      return false;
    const custom = p.difficulty === "custom";
    if (!custom && n !== SIZES[p.difficulty as Difficulty]) return false;
    const id = `generated-v${p.generator_version}-${custom ? "custom-" + n : p.difficulty}-${p.seed}`;
    if (p.id !== id) return false;
  }
  return true;
}
export function clues(p: Puzzle): Clues {
  const n = p.size,
    rows = Array(n).fill(0),
    columns = Array(n).fill(0),
    groups = Array(Math.max(...p.regions) + 1).fill(0);
  p.answer.forEach((v, i) => {
    if (v) {
      rows[Math.floor(i / n)] += p.values[i];
      columns[i % n] += p.values[i];
      if (p.regions[i] >= 0) groups[p.regions[i]] += p.values[i];
    }
  });
  return {
    size: n,
    values: p.values,
    regions: p.regions,
    rows,
    columns,
    groups,
  };
}
export function groups(c: Clues) {
  const n = c.size;
  return [
    ...c.rows.map((target, r) => ({
      target,
      members: c.values.map((_, i) => i).filter((i) => Math.floor(i / n) === r),
    })),
    ...c.columns.map((target, col) => ({
      target,
      members: c.values.map((_, i) => i).filter((i) => i % n === col),
    })),
    ...c.groups.map((target, g) => ({
      target,
      members: c.regions.map((_, i) => i).filter((i) => c.regions[i] === g),
    })),
  ];
}
/** Public clues only; independently counts up to two assignments. */
export function solve(c: Clues, limit = 50000) {
  const n = c.size,
    targets = [...c.columns, ...c.groups],
    chosen = Array(n * n).fill(false);
  let count = 0,
    nodes = 0,
    complete = true,
    solution: boolean[] = [];
  const choices = c.rows.map((target, row) => {
    const out: { mask: number; sums: number[] }[] = [];
    for (let mask = 0; mask < 1 << n; mask++) {
      let sum = 0;
      const sums = targets.map(() => 0);
      for (let col = 0; col < n; col++)
        if (mask & (1 << col)) {
          const i = row * n + col,
            v = c.values[i];
          sum += v;
          sums[col] += v;
          if (c.regions[i] >= 0) sums[n + c.regions[i]] += v;
        }
      if (sum === target) out.push({ mask, sums });
    }
    return out;
  });
  const order = Array.from({ length: n }, (_, i) => i).sort(
      (a, b) => choices[a].length - choices[b].length,
    ),
    low = Array.from({ length: n + 1 }, () => targets.map(() => 0)),
    high = Array.from({ length: n + 1 }, () => targets.map(() => 0));
  for (let d = n - 1; d >= 0; d--) {
    if (!choices[order[d]].length)
      return { count: 0, nodes: 0, complete: true, solution };
    targets.forEach((_, g) => {
      low[d][g] =
        low[d + 1][g] + Math.min(...choices[order[d]].map((o) => o.sums[g]));
      high[d][g] =
        high[d + 1][g] + Math.max(...choices[order[d]].map((o) => o.sums[g]));
    });
  }
  function visit(d: number, left: number[]) {
    if (count >= 2 || !complete) return;
    if (nodes++ >= limit) {
      complete = false;
      return;
    }
    if (left.some((v, g) => v < low[d][g] || v > high[d][g])) return;
    if (d === n) {
      if (++count === 1) solution = chosen.slice();
      return;
    }
    const row = order[d];
    for (const o of choices[row]) {
      for (let col = 0; col < n; col++)
        chosen[row * n + col] = !!(o.mask & (1 << col));
      visit(
        d + 1,
        left.map((v, g) => v - o.sums[g]),
      );
      if (count >= 2 || !complete) return;
    }
  }
  visit(0, targets);
  return { count, nodes, complete, solution };
}
export function deduce(c: Clues) {
  const cells = Array(c.size ** 2).fill(-1),
    all = groups(c);
  let combination = 0,
    basic = 0;
  for (;;) {
    let progressed = false;
    for (const technique of [0, 1]) {
      for (const g of all) {
        const unknown = g.members.filter((i) => cells[i] === -1),
          remaining =
            g.target -
            g.members.reduce(
              (s, i) => s + (cells[i] === 1 ? c.values[i] : 0),
              0,
            ),
          total = unknown.reduce((s, i) => s + c.values[i], 0);
        if (remaining < 0 || remaining > total)
          return { solved: false, combination, basic, cells };
        const forced: [number, number][] = [];
        if (!technique) {
          for (const i of unknown)
            if (c.values[i] > remaining) forced.push([i, 0]);
            else if (total - c.values[i] < remaining) forced.push([i, 1]);
        } else if (unknown.length) {
          const counts = Array(remaining + 1).fill(0);
          counts[0] = 1;
          for (const i of unknown)
            for (let s = remaining; s >= c.values[i]; s--)
              counts[s] += counts[s - c.values[i]];
          if (!counts[remaining])
            return { solved: false, combination, basic, cells };
          for (const i of unknown) {
            const v = c.values[i],
              without = Array(remaining + 1).fill(0);
            for (let s = 0; s <= remaining; s++)
              without[s] = counts[s] - (s >= v ? without[s - v] : 0);
            const erase = without[remaining] > 0,
              mark = remaining >= v && without[remaining - v] > 0;
            if (!erase || !mark) forced.push([i, mark ? 1 : 0]);
          }
        }
        if (forced.length) {
          for (const [i, v] of forced) cells[i] = v;
          if (technique) combination += forced.length;
          else basic += forced.length;
          progressed = true;
          break;
        }
      }
      if (progressed) break;
    }
    if (!progressed)
      return { solved: !cells.includes(-1), combination, basic, cells };
  }
}
export function accepts(d: Difficulty, r: ReturnType<typeof deduce>) {
  return (
    r.solved &&
    (d === "beginner"
      ? r.combination === 0
      : d === "easy"
        ? r.combination <= 2
        : d === "medium"
          ? r.combination >= 2
          : r.combination >= 5)
  );
}
export function generate(
  d: Difficulty,
  seed: string,
  now = () => performance.now(),
): Puzzle {
  if (!/^[a-f0-9]{32}$/i.test(seed)) throw Error("Invalid seed");
  let state = 2166136261;
  for (const char of seed)
    state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  const rand = () => {
      state += 0x6d2b79f5;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    pick = (n: number) => Math.floor(rand() * n);
  const n = SIZES[d],
    deadline = now() + 5000;
  for (let attempt = 0; attempt < 16384 && now() < deadline; attempt++) {
    const values = Array.from(
        { length: n * n },
        () => 1 + pick(d === "hard" ? 5 : d === "medium" ? 6 : 9),
      ),
      answer = values.map(() => rand() < 0.5),
      regions = values.map(() => -1),
      frontier: [number, number][] = [];
    for (let g = 0; g < n; g++) {
      let i = pick(n * n);
      while (regions[i] >= 0) i = pick(n * n);
      regions[i] = g;
      neighbors(i, n).forEach((j) => frontier.push([j, g]));
    }
    while (frontier.length) {
      const k = pick(frontier.length),
        [i, g] = frontier[k];
      frontier[k] = frontier.at(-1)!;
      frontier.pop();
      if (regions[i] >= 0) continue;
      regions[i] = g;
      neighbors(i, n)
        .filter((j) => regions[j] < 0)
        .forEach((j) => frontier.push([j, g]));
    }
    const p: Puzzle = {
      id: `generated-v3-${d}-${seed}`,
      difficulty: d,
      size: n,
      values,
      answer,
      regions,
      generated: true,
      completed: false,
      generator_version: 3,
      seed,
    };
    const c = clues(p),
      all = groups(c);
    if (
      all.some(
        (g) =>
          g.members.length < 2 ||
          g.members.every((i) => answer[i]) ||
          g.members.every((i) => !answer[i]),
      )
    )
      continue;
    if (!accepts(d, deduce(c))) continue;
    const r = solve(c, 20000);
    if (
      r.complete &&
      r.count === 1 &&
      r.solution.every((v, i) => v === answer[i])
    )
      return p;
  }
  throw Error("This puzzle took too long to prepare. Try again.");
}
