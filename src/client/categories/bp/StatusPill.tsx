import { categorise, type BpAverage } from "../../../shared/bp.ts";
import { BP_STATUS } from "../../format.ts";

/** The NICE category for a multi-day average, shown with a coloured dot and a label. */
export function StatusPill({ average }: { average: Pick<BpAverage, "systolic" | "diastolic"> }) {
  const status = BP_STATUS[categorise(average)];
  return (
    <span className="status-pill" style={{ background: status.tint }}>
      <span className="status-dot" style={{ background: status.color }} aria-hidden="true" />
      {status.label}
    </span>
  );
}
