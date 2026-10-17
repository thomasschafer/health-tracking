import { describe, expect, it } from "vitest";
import { bpSessionInputSchema } from "../../shared/bp.ts";
import { createSession, deleteSession } from "../bp-repo.ts";
import { openDatabase, type Db } from "../db/index.ts";
import { saveSettings } from "../settings-repo.ts";
import { driveTarget, type ExportTarget } from "./drive.ts";
import { runExport } from "./export-check.ts";
import { exportJson, importJson } from "./json-export.ts";
import { dataChecksum } from "./replica-check.ts";

const now = new Date("2026-10-17T20:10:00.000Z");

function seeded(): Db {
  const db = openDatabase(":memory:");
  const ids = [crypto.randomUUID(), crypto.randomUUID()];
  for (const id of ids) {
    createSession(
      db,
      bpSessionInputSchema.parse({
        id,
        takenAt: "2026-10-17T20:05:00.000Z",
        note: 'with "quotes", commas',
        readings: [
          { systolic: 125, diastolic: 80, heartRate: 61 },
          { systolic: 122, diastolic: 79, heartRate: null },
        ],
      }),
      now,
    );
  }
  deleteSession(db, ids[1] ?? "", now);
  saveSettings(db, { readingsPerSession: 2, restTimerSeconds: 30 });
  return db;
}

function memoryTarget(): ExportTarget & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    upload: (name, content) => {
      files.set(name, content);
      return Promise.resolve(name);
    },
    download: (id) => {
      const content = files.get(id);
      return content === undefined
        ? Promise.reject(new Error("missing"))
        : Promise.resolve(content);
    },
  };
}

describe("JSON export", () => {
  it("round-trips all data, including deleted sessions and settings", () => {
    const db = seeded();
    const restored = openDatabase(":memory:");
    importJson(restored, JSON.parse(JSON.stringify(exportJson(db, now))));
    expect(dataChecksum(restored.$client)).toBe(dataChecksum(db.$client));
  });

  it("refuses to import over existing data", () => {
    const db = seeded();
    expect(() => {
      importJson(db, exportJson(db, now));
    }).toThrow("already has sessions");
  });

  it("rejects malformed exports", () => {
    expect(() => {
      importJson(openDatabase(":memory:"), { format: "something-else" });
    }).toThrow();
  });
});

describe("runExport", () => {
  it("uploads JSON and CSV and verifies them", async () => {
    const target = memoryTarget();
    const result = await runExport(seeded(), target, now);
    expect(result).toEqual({
      ok: true,
      detail:
        "Uploaded and verified health-export-2026-10-17.json and blood-pressure-2026-10-17.csv.",
    });
    expect([...target.files.keys()]).toEqual([
      "health-export-2026-10-17.json",
      "blood-pressure-2026-10-17.csv",
    ]);
  });

  it("fails when the stored copy differs from what was uploaded", async () => {
    const target = memoryTarget();
    const corrupting: ExportTarget = {
      upload: (name, content, mimeType) => target.upload(name, content, mimeType),
      download: async (id) => `${await target.download(id)} `,
    };
    const result = await runExport(seeded(), corrupting, now);
    expect(result).toEqual({
      ok: false,
      detail: "health-export-2026-10-17.json in Google Drive doesn't match what was uploaded.",
    });
  });
});

describe("driveTarget", () => {
  interface Call {
    method: string;
    url: string;
    body: string;
  }

  function fakeDrive(existing: { folder: boolean; file: boolean }) {
    const calls: Call[] = [];
    const fetchFn = (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
      const url = input instanceof Request ? input.url : String(input);
      const method = init.method ?? "GET";
      calls.push({
        method,
        url,
        body: typeof init.body === "string" ? init.body : "",
      });
      const json = (data: unknown) => Promise.resolve(Response.json(data));
      if (url.startsWith("https://oauth2.googleapis.com/token"))
        return json({ access_token: "token" });
      if (method === "GET" && url.includes("/drive/v3/files?")) {
        const q = new URL(url).searchParams.get("q") ?? "";
        if (q.includes("folder"))
          return json({ files: existing.folder ? [{ id: "folder-1", name: "f" }] : [] });
        return json({ files: existing.file ? [{ id: "file-1", name: "x" }] : [] });
      }
      if (method === "POST" && url.endsWith("/drive/v3/files?fields=id"))
        return json({ id: "folder-new" });
      if (url.includes("/upload/drive/v3/files"))
        return json({ id: existing.file ? "file-1" : "file-new" });
      if (url.endsWith("?alt=media")) return Promise.resolve(new Response("content"));
      return Promise.resolve(new Response("unexpected", { status: 500 }));
    };
    return {
      calls,
      target: driveTarget(
        { clientId: "id", clientSecret: "secret", refreshToken: "refresh" },
        fetchFn,
      ),
    };
  }

  it("creates the folder and a new file on first upload", async () => {
    const { calls, target } = fakeDrive({ folder: false, file: false });
    expect(await target.upload("a.csv", "content", "text/csv")).toBe("file-new");
    const upload = calls.find((c) => c.url.includes("/upload/"));
    expect(upload?.method).toBe("POST");
    expect(upload?.body).toContain('"parents":["folder-new"]');
    expect(upload?.body).toContain("content");
  });

  it("replaces an existing file with the same name", async () => {
    const { calls, target } = fakeDrive({ folder: true, file: true });
    expect(await target.upload("a.csv", "content", "text/csv")).toBe("file-1");
    expect(calls.find((c) => c.url.includes("/upload/"))).toMatchObject({ method: "PATCH" });
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/files?fields=id"))).toBe(
      false,
    );
  });

  it("surfaces Google errors", async () => {
    const target = driveTarget(
      { clientId: "id", clientSecret: "secret", refreshToken: "bad" },
      () => Promise.resolve(new Response("invalid_grant", { status: 400 })),
    );
    await expect(target.download("x")).rejects.toThrow(
      "token refresh failed with 400: invalid_grant",
    );
  });
});
