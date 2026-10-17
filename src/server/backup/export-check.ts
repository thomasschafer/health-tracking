import { createHash } from "node:crypto";
import { listSessions } from "../bp-repo.ts";
import { openDatabase, type Db } from "../db/index.ts";
import { sessionsToCsv } from "../export.ts";
import { localDateKey } from "../../shared/time.ts";
import type { ExportTarget } from "./drive.ts";
import { exportJson, importJson } from "./json-export.ts";
import { dataChecksum, type CheckResult } from "./replica-check.ts";

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/**
 * Uploads today's export, downloads it again to confirm the stored copy is byte-for-byte what
 * was sent, and rebuilds a database from the JSON to prove it holds all the data.
 */
export async function runExport(db: Db, target: ExportTarget, now: Date): Promise<CheckResult> {
  const day = localDateKey(now);
  const json = JSON.stringify(exportJson(db, now), null, 2);
  const csv = sessionsToCsv(listSessions(db));

  const rebuilt = openDatabase(":memory:");
  try {
    importJson(rebuilt, JSON.parse(json));
    if (dataChecksum(rebuilt.$client) !== dataChecksum(db.$client)) {
      return {
        ok: false,
        detail: "A database rebuilt from the export doesn't match the live data.",
      };
    }
  } finally {
    rebuilt.$client.close();
  }

  const files = [
    { name: `health-export-${day}.json`, content: json, mimeType: "application/json" },
    { name: `blood-pressure-${day}.csv`, content: csv, mimeType: "text/csv" },
  ];
  for (const file of files) {
    const id = await target.upload(file.name, file.content, file.mimeType);
    const stored = await target.download(id);
    if (sha256(stored) !== sha256(file.content)) {
      return { ok: false, detail: `${file.name} in Google Drive doesn't match what was uploaded.` };
    }
  }
  return { ok: true, detail: `Uploaded and verified ${files.map((f) => f.name).join(" and ")}.` };
}
