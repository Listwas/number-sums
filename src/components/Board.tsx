import { useLayoutEffect, useRef, useState } from "react";
import { clues, groups } from "../core/puzzle";
import type { Attempt } from "../core/profile";
export function Board({
  attempt: a,
  onMove,
  paused,
  mistake,
}: {
  attempt: Attempt;
  onMove: (i: number) => void;
  paused: boolean;
  mistake: number | null;
}) {
  const box = useRef<HTMLDivElement>(null),
    [side, setSide] = useState(48),
    n = a.puzzle.size,
    c = clues(a.puzzle),
    all = groups(c),
    row = all.slice(0, n),
    col = all.slice(n, 2 * n),
    regions = all.slice(2 * n);
  const done = (g: { members: number[] }) =>
      g.members.every((i) => a.cells[i] !== 0),
    sum = (g: { members: number[] }) =>
      g.members.reduce(
        (s, i) => s + (a.cells[i] === 1 ? a.puzzle.values[i] : 0),
        0,
      );
  useLayoutEffect(() => {
    const el = box.current!;
    const fit = () => {
      const dpr = devicePixelRatio || 1;
      const viewport = el.closest<HTMLElement>(".game-viewport")!;
      const group = viewport.querySelector<HTMLElement>(".game-group")!;
      const height =
        viewport.clientHeight - (group.offsetHeight - el.offsetHeight) - 4;
      setSide(
        Math.max(
          24,
          Math.floor(((Math.min(el.clientWidth, height) - 48) / n) * dpr) / dpr,
        ),
      );
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    observer.observe(el.closest<HTMLElement>(".game-viewport")!);
    window.addEventListener("resize", fit);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [n]);
  const target = (g: { target: number; members: number[] }, key: string) => (
    <span
      key={key}
      className={"target " + (done(g) ? "complete" : "")}
      aria-label={`Target ${g.target}, marked sum ${sum(g)}${done(g) ? ", complete" : ""}`}
    >
      <small>{sum(g)}</small>
      <span>{g.target}</span>
    </span>
  );
  return (
    <div className="board-space" ref={box}>
      <div
        className="board"
        style={{ "--side": `${side}px`, "--n": n } as React.CSSProperties}
      >
        <div className="column-targets">
          {col.map((g, i) => target(g, "c" + i))}
        </div>
        <div className="row-targets">
          {row.map((g, i) => target(g, "r" + i))}
        </div>
        <div className="cells" role="group" aria-label={`${n} by ${n} puzzle`}>
          {a.puzzle.values.map((v, i) => {
            const g = a.puzzle.regions[i],
              state = a.cells[i],
              cleared = g >= 0 && done(regions[g]),
              first = g >= 0 && a.puzzle.regions.indexOf(g) === i;
            return (
              <button
                key={i}
                data-cell={i}
                className={`cell region-${g} ${state === 1 ? "marked" : state === 2 ? "erased" : ""} ${cleared ? "cleared" : ""} ${mistake === i ? "mistake" : ""}`}
                disabled={paused || a.status !== "playing" || !!state}
                aria-label={`Row ${Math.floor(i / n) + 1}, column ${(i % n) + 1}: ${v}${state === 1 ? ", marked" : state === 2 ? ", erased" : ""}`}
                onClick={() => onMove(i)}
                onKeyDown={(e) => {
                  const delta =
                    e.key === "ArrowLeft"
                      ? -1
                      : e.key === "ArrowRight"
                        ? 1
                        : e.key === "ArrowUp"
                          ? -n
                          : e.key === "ArrowDown"
                            ? n
                            : 0;
                  if (delta) {
                    e.preventDefault();
                    const buttons = [
                      ...box.current!.querySelectorAll<HTMLButtonElement>(
                        "[data-cell]",
                      ),
                    ];
                    for (
                      let next = i + delta;
                      next >= 0 && next < n * n;
                      next += delta
                    )
                      if (!buttons[next].disabled) {
                        buttons[next].focus();
                        break;
                      }
                  }
                }}
              >
                {first && (
                  <small
                    className="region-target"
                    aria-label={`Region target ${c.groups[g]}`}
                  >
                    {c.groups[g]}
                  </small>
                )}
                <span className="number">{v}</span>
                <svg
                  className="mark-ring"
                  viewBox="0 0 100 100"
                  aria-hidden="true"
                  focusable="false"
                >
                  <circle
                    cx="50"
                    cy="50"
                    r="47"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
