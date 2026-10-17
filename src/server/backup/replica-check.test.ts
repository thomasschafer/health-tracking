import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bpSessionInputSchema } from "../../shared/bp.ts";
import { createSession } from "../bp-repo.ts";
import { openDatabase, type Db } from "../db/index.ts";
import { checkReplica } from "./replica-check.ts";

const litestreamBin = fileURLToPath(new URL("../../../.tools/bin/litestream", import.meta.url));
if (!existsSync(litestreamBin)) {
  throw new Error(`Litestream not found at ${litestreamBin}. Run scripts/install-litestream.sh.`);
}

let dir: string;
let db: Db;
let databasePath: string;
let configPath: string;
let replicator: ChildProcess | null = null;

function addSession(): void {
  createSession(
    db,
    bpSessionInputSchema.parse({
      id: crypto.randomUUID(),
      takenAt: "2026-10-17T20:05:00.000Z",
      note: null,
      readings: [{ systolic: 125, diastolic: 80, heartRate: null }],
    }),
    new Date(),
  );
}

function startReplicating(): void {
  replicator = spawn(litestreamBin, ["replicate", "-config", configPath], { stdio: "ignore" });
}

async function stopReplicating(): Promise<void> {
  const proc = replicator;
  replicator = null;
  if (proc?.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    proc.once("exit", () => {
      resolve();
    });
    proc.kill("SIGTERM");
  });
}

const check = (timeoutMs: number) =>
  checkReplica({
    db,
    databasePath,
    litestreamBin,
    litestreamConfig: configPath,
    timeoutMs,
    pollIntervalMs: 500,
  });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "health-replica-test-"));
  databasePath = join(dir, "health.db");
  configPath = join(dir, "litestream.yml");
  writeFileSync(
    configPath,
    `dbs:\n  - path: ${databasePath}\n    replica:\n      type: file\n      path: ${join(dir, "replica")}\n      sync-interval: 200ms\n`,
  );
  db = openDatabase(databasePath);
  addSession();
});

afterEach(async () => {
  await stopReplicating();
  db.$client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("checkReplica", () => {
  it("passes when the replica is current and restorable", async () => {
    startReplicating();
    const result = await check(30_000);
    expect(result).toEqual({
      ok: true,
      detail: "Restored 1 sessions; data matches the live database.",
    });
  }, 40_000);

  it("fails when nothing has been replicated", async () => {
    const result = await check(2_000);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("litestream restore failed");
  }, 10_000);

  it("fails when replication has stopped", async () => {
    startReplicating();
    expect((await check(30_000)).ok).toBe(true);
    await stopReplicating();
    addSession();
    const result = await check(3_000);
    expect(result).toMatchObject({ ok: false });
    expect(result.detail).toContain("hasn't caught up");
  }, 60_000);
});
