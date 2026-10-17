import { categorise, type BpAverage } from "../../shared/bp.ts";
import { CATEGORY_COLORS, categoryLabel } from "../format.ts";

export function CategoryBadge({ average }: { average: Pick<BpAverage, "systolic" | "diastolic"> }) {
  const category = categorise(average);
  return (
    <span className="category">
      <span className="dot" style={{ background: CATEGORY_COLORS[category] }} aria-hidden="true" />
      {categoryLabel(category)}
    </span>
  );
}
