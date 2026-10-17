import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { averageSessions, periodOf } from "../src/shared/bp.ts";
import { createSession } from "../src/server/bp-repo.ts";
import { loadConfig } from "../src/server/config.ts";
import { openDatabase } from "../src/server/db/index.ts";
import { parseSheet, type ImportIssue } from "./sheet-import.ts";

const USAGE = `Usage: node scripts/import-sheet.ts <sheet.csv> [--resolutions <file.json>] [--apply]

Without --apply, only reports what would be imported. Rows that can't be imported unambiguously
are written to import-review.md next to the CSV. Resolve them in a JSON file of the form
[{ "row": 123, "action": "skip" }, { "row": 124, "action": "fix", "time": "23:55", "label": "PM" }]
and pass it
with --resolutions. Re-running is safe: sessions that were already imported are left alone.`;

const resolutionsSchema = z.array(
  z
    .object({
      row: z.number().int().positive(),
      action: z.enum(["skip", "fix"]),
      time: z.string().optional(),
      label: z.enum(["AM", "PM"]).optional(),
      readings: z
        .array(z.object({ systolic: z.number().int(), diastolic: z.number().int() }).strict())
        .optional(),
    })
    .strict(),
);

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { resolutions: { type: "string" }, apply: { type: "boolean", default: false } },
});
const csvPath = positionals[0];
if (csvPath === undefined || positionals.length !== 1) {
  console.error(USAGE);
  process.exit(2);
}

const resolutions =
  values.resolutions === undefined
    ? []
    : resolutionsSchema.parse(JSON.parse(readFileSync(values.resolutions, "utf8"))).map((r) => ({
        row: r.row,
        action: r.action,
        ...(r.time === undefined ? {} : { time: r.time }),
        ...(r.label === undefined ? {} : { label: r.label }),
        ...(r.readings === undefined ? {} : { readings: r.readings }),
      }));

const result = parseSheet(readFileSync(csvPath, "utf8"), resolutions);

const describeIssue = (i: ImportIssue) =>
  `- Row ${String(i.row)} (${i.date ?? "no date"} ${i.label}): ${i.problem}\n  Cells: \`${i.cells.slice(0, 11).join(", ")}\``;
const reviewPath = join(dirname(csvPath), "import-review.md");
writeFileSync(
  reviewPath,
  result.issues.length === 0
    ? "# Import review\n\nNothing needs review.\n"
    : `# Import review\n\nThese rows were not imported. Add a resolution for each and re-run.\n\n${result.issues.map(describeIssue).join("\n")}\n`,
);

const fmt = (n: number | undefined) => (n === undefined ? "–" : n.toFixed(2));
const morning = averageSessions(
  result.sessions.filter((s) => periodOf(new Date(s.takenAt)) === "morning"),
);
const evening = averageSessions(
  result.sessions.filter((s) => periodOf(new Date(s.takenAt)) === "evening"),
);
console.log(`Sessions ready to import: ${String(result.sessions.length)}`);
console.log(`Empty slots skipped: ${String(result.emptySlots)}`);
console.log(`Rows needing review: ${String(result.issues.length)} (see ${reviewPath})`);
console.log("\nCross-check against the sheet's own averages:");
for (const { label, sheetValue } of result.summary) {
  const avg = label.endsWith("AM") ? morning : evening;
  const computed = label.startsWith("Systolic") ? avg?.systolic : avg?.diastolic;
  console.log(`  ${label}: sheet ${fmt(sheetValue)}, parsed ${fmt(computed)}`);
}

if (!values.apply) {
  console.log("\nDry run only. Re-run with --apply to write to the database.");
  process.exit(0);
}

const config = loadConfig(process.env);
mkdirSync(join(config.dataDir, "backups"), { recursive: true, mode: 0o700 });
const db = openDatabase(config.databasePath);
const backupPath = join(
  config.dataDir,
  "backups",
  `pre-import-${new Date().toISOString().replaceAll(":", "-")}.db`,
);
db.$client.exec(`VACUUM INTO '${backupPath.replaceAll("'", "''")}'`);
console.log(`\nBacked up the database to ${backupPath}`);

const now = new Date();
const counts = db.$client.transaction(() => {
  let created = 0;
  let unchanged = 0;
  for (const session of result.sessions) {
    const outcome = createSession(db, session, now, "sheet-import");
    if (outcome.kind === "created") created++;
    else unchanged++;
  }
  return { created, unchanged };
})();
console.log(
  `Imported ${String(counts.created)} new sessions (${String(counts.unchanged)} already present).`,
);
db.$client.close();
