import { parseRow, type RowDraft, type Step } from "./model.ts";

/** One dash per reading in the session, highlighting the current one. */
export function ReadingProgress({ rows, step }: { rows: readonly RowDraft[]; step: Step }) {
  return (
    <ol className="reading-progress" aria-label="Readings">
      {rows.map((row, i) => {
        const current =
          (step.kind === "reading" && step.index === i) ||
          (step.kind === "rest" && step.nextIndex === i);
        const done = parseRow(row).ok && !current;
        return (
          <li key={i} className={current ? "current" : done ? "done" : undefined}>
            <span className="sr-only">
              Reading {i + 1}
              {current ? " (current)" : done ? " (done)" : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
