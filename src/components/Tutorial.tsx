import { useState } from "react";
export function Tutorial({ onFinish }: { onFinish: () => void }) {
  const [step, setStep] = useState(0),
    [erase, setErase] = useState(false),
    [answers, setAnswers] = useState<number[]>([0, 0, 0]),
    [message, setMessage] = useState("");
  const practice = (i: number) => {
    if (answers[i]) return;
    if (erase !== (i === 2)) {
      setMessage(
        i === 2
          ? "Choose Erase for 4. It is not part of 2 + 3."
          : "Choose Mark. This number helps make 5.",
      );
      return;
    }
    const next = [...answers];
    next[i] = erase ? 2 : 1;
    setAnswers(next);
    setMessage(
      next.every(Boolean)
        ? "Solved! 2 + 3 = 5, and 4 is left out."
        : "Correct. Try the other numbers.",
    );
  };
  return (
    <div className="tutorial">
      <span className="lesson-count">{step + 1} / 3</span>
      <h3 className="lesson-title">
        {
          ["Make the target", "Check each direction", "Answer every square"][
            step
          ]
        }
      </h3>
      {step === 0 ? (
        <>
          <p>
            The target is <strong>5</strong>. Mark <strong>2</strong> and{" "}
            <strong>3</strong> to add them. Erase <strong>4</strong> to leave it
            out.
          </p>
          <div className="example-row">
            <span className="example-target" aria-label="Target 5">
              5
            </span>
            {[2, 3, 4].map((v, i) => (
              <button
                key={i}
                aria-label={`Practice number ${v}`}
                disabled={!!answers[i]}
                className={
                  "example-number " +
                  (answers[i] === 1
                    ? "chosen"
                    : answers[i] === 2
                      ? "removed"
                      : "")
                }
                onClick={() => practice(i)}
              >
                {v}
              </button>
            ))}
          </div>
          <div
            className="practice-modes"
            role="group"
            aria-label="Practice mode"
          >
            <button aria-pressed={erase} onClick={() => setErase(true)}>
              Erase
            </button>
            <button aria-pressed={!erase} onClick={() => setErase(false)}>
              Mark
            </button>
          </div>
          <p className="example-equation">2 + 3 = 5</p>
          <p className="lesson-tip" aria-live="polite">
            {message || "Try marking 2 and 3, then erasing 4."}
          </p>
        </>
      ) : step === 1 ? (
        <>
          <p>
            Marked numbers must match the targets for each <strong>row</strong>,{" "}
            <strong>column</strong> and <strong>color</strong>.
          </p>
          <div className="target-example">
            <span className="column-label">Columns ↓</span>
            <span className="row-label">Rows →</span>
            <div
              className="target-demo"
              role="img"
              aria-label="Column targets 2 and 4. Row targets 5 and 1. Top colored region target 5 contains marked 2 and 3. Bottom region target 1 contains erased 4 and marked 1."
            >
              <span />
              <b>2</b>
              <b>4</b>
              <b>5</b>
              <span className="demo-region top">
                <small>5</small>
                <i>2</i>
                <i>3</i>
              </span>
              <b>1</b>
              <span className="demo-region bottom">
                <small>1</small>
                <i className="out">4</i>
                <i>1</i>
              </span>
            </div>
          </div>
          <p className="lesson-tip">
            Outside numbers are row and column targets. A small number inside a
            color is that color’s target.
          </p>
        </>
      ) : (
        <>
          <p>
            Mark or erase <strong>every number</strong> to win. Correct answers
            lock in place.
          </p>
          <p>
            A target clears after every number in its group is answered-even the
            erased ones.
          </p>
          <div className="lesson-rules">
            <p>
              <strong>Standard:</strong> three lives. A wrong answer costs one
              life.
            </p>
            <p>
              <strong>Relaxed:</strong> no life limit. Wrong answers stay
              unchanged so you can try again.
            </p>
          </div>
          <p className="lesson-tip">
            Pause whenever you like. Progress saves automatically.
          </p>
        </>
      )}
      <div className="tutorial-actions">
        {step > 0 && (
          <button className="secondary" onClick={() => setStep(step - 1)}>
            Back
          </button>
        )}
        <button
          className="primary"
          onClick={() => (step < 2 ? setStep(step + 1) : onFinish())}
        >
          {step < 2 ? "Next" : "Play"}
        </button>
      </div>
    </div>
  );
}
