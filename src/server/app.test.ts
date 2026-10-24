import { beforeEach, describe, expect, it } from "vitest";
import type { Hono } from "hono";
import { createApp } from "./app.ts";
import { openDatabase } from "./db/index.ts";

const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
const body = {
  id,
  takenAt: "2026-10-17T20:05:00.000Z",
  note: "evening, after a walk",
  readings: [
    { systolic: 130, diastolic: 80, heartRate: 60 },
    { systolic: 128, diastolic: 79, heartRate: null },
    { systolic: 126, diastolic: 78, heartRate: 62 },
  ],
};

const json = (method: string, payload: unknown, headers: Record<string, string> = {}) => ({
  method,
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify(payload),
});

/** A change with no body, as the client sends one. */
const bodyless = (method: string, headers: Record<string, string> = {}) => ({
  method,
  headers: { "Content-Type": "application/json", ...headers },
});

let app: Hono;
beforeEach(() => {
  app = createApp({
    db: openDatabase(":memory:"),
    now: () => new Date("2026-10-17T20:10:00.000Z"),
    backupStatus: () => ({
      replica: { state: "not-configured" },
      export: { state: "not-configured" },
      manualExport: { lastExportedAt: null, due: true },
    }),
    allowedTailscaleLogin: null,
    clientDir: null,
  });
});

describe("blood pressure API", () => {
  it("creates, lists, edits, deletes and restores sessions", async () => {
    expect((await app.request("/api/bp/sessions", json("POST", body))).status).toBe(201);
    expect((await app.request("/api/bp/sessions", json("POST", body))).status).toBe(200);

    const list = (await (await app.request("/api/bp/sessions")).json()) as { sessions: unknown[] };
    expect(list.sessions).toHaveLength(1);

    const { id: _, ...content } = body;
    const edited = await app.request(
      `/api/bp/sessions/${id}`,
      json("PUT", { ...content, note: "edited" }),
    );
    expect(edited.status).toBe(200);
    expect(((await edited.json()) as { session: { note: string } }).session.note).toBe("edited");

    expect((await app.request(`/api/bp/sessions/${id}`, bodyless("DELETE"))).status).toBe(204);
    expect((await app.request(`/api/bp/sessions/${id}`)).status).toBe(404);
    expect((await app.request(`/api/bp/sessions/${id}/restore`, bodyless("POST"))).status).toBe(
      200,
    );
    expect((await app.request(`/api/bp/sessions/${id}`)).status).toBe(200);
  });

  it("rejects conflicting creates", async () => {
    await app.request("/api/bp/sessions", json("POST", body));
    const res = await app.request("/api/bp/sessions", json("POST", { ...body, note: "other" }));
    expect(res.status).toBe(409);
  });

  it("rejects invalid input with details", async () => {
    const res = await app.request(
      "/api/bp/sessions",
      json("POST", { ...body, readings: [{ systolic: 70, diastolic: 90, heartRate: null }] }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      issues: [{ message: "Systolic must be higher than diastolic" }],
    });
  });

  it("rejects malformed JSON", async () => {
    const res = await app.request("/api/bp/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    expect(res.status).toBe(400);
  });

  it("does not let a PUT body change the session ID", async () => {
    await app.request("/api/bp/sessions", json("POST", body));
    const otherId = "1f8fad5b-d9cb-469f-a165-70867728950e";
    const res = await app.request(`/api/bp/sessions/${otherId}`, json("PUT", body));
    expect(res.status).toBe(404);
  });

  it("exports CSV filtered by day", async () => {
    await app.request("/api/bp/sessions", json("POST", body));
    const res = await app.request("/api/bp/export.csv?from=2026-10-17&to=2026-10-17");
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    const lines = (await res.text()).trim().split("\r\n");
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe(
      `${id},2026-10-17,21:05,evening,2026-10-17T20:05:00.000Z,1,130,80,60,128.00,79.00,"evening, after a walk"`,
    );
    const empty = await app.request("/api/bp/export.csv?from=2026-10-18");
    expect((await empty.text()).trim().split("\r\n")).toHaveLength(1);
    expect((await app.request("/api/bp/export.csv?from=yesterday")).status).toBe(400);
  });
});

describe("export API", () => {
  it("exports all data as restorable JSON and records manual exports", async () => {
    await app.request("/api/bp/sessions", json("POST", body));
    const res = await app.request("/api/export.json");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="health-export-2026-10-17.json"',
    );
    const exported = (await res.json()) as { format: string; tables: { bp_sessions: unknown[] } };
    expect(exported.format).toBe("health-tracking-export");
    expect(exported.tables.bp_sessions).toHaveLength(1);
    expect((await app.request("/api/manual-exports", bodyless("POST"))).status).toBe(201);
  });
});

describe("settings API", () => {
  it("returns defaults and saves changes", async () => {
    expect(await (await app.request("/api/settings")).json()).toEqual({
      settings: { readingsPerSession: 3, restTimerSeconds: 60 },
    });
    const res = await app.request(
      "/api/settings",
      json("PUT", { readingsPerSession: 1, restTimerSeconds: 0 }),
    );
    expect(await res.json()).toEqual({ settings: { readingsPerSession: 1, restTimerSeconds: 0 } });
    expect(
      (
        await app.request(
          "/api/settings",
          json("PUT", { readingsPerSession: 9, restTimerSeconds: 60 }),
        )
      ).status,
    ).toBe(400);
  });
});

describe("Tailscale login check", () => {
  it("only allows the configured login, except for the health check", async () => {
    app = createApp({
      db: openDatabase(":memory:"),
      now: () => new Date(),
      backupStatus: () => ({
        replica: { state: "not-configured" },
        export: { state: "not-configured" },
        manualExport: { lastExportedAt: null, due: true },
      }),
      allowedTailscaleLogin: "me@example.com",
      clientDir: null,
    });
    expect((await app.request("/api/health")).status).toBe(200);
    expect((await app.request("/api/bp/sessions")).status).toBe(403);
    const other = { headers: { "Tailscale-User-Login": "someone@example.com" } };
    expect((await app.request("/api/bp/sessions", other)).status).toBe(403);
    const me = { headers: { "Tailscale-User-Login": "me@example.com" } };
    expect((await app.request("/api/bp/sessions", me)).status).toBe(200);
  });
});

describe("cross-site request protection", () => {
  const host = "laptop.example.ts.net:8443";
  // What Tailscale Serve forwards to the app: the browser's Host, plus forwarded headers.
  const viaServe = { Host: host, "X-Forwarded-Host": host, "X-Forwarded-Proto": "https" };

  it("refuses changes that aren't JSON, even without a body", async () => {
    const res = await app.request("/api/bp/sessions", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(415);
    expect((await app.request("/api/manual-exports", { method: "POST" })).status).toBe(415);
    expect((await app.request(`/api/bp/sessions/${id}`, { method: "DELETE" })).status).toBe(415);
    expect(await (await app.request("/api/bp/sessions")).json()).toEqual({
      sessions: [],
    });
  });

  it("accepts a JSON content type with parameters", async () => {
    const res = await app.request("/api/bp/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(201);
  });

  it("refuses requests the browser marks as cross-site", async () => {
    for (const site of ["cross-site", "same-site"]) {
      const res = await app.request(
        "/api/bp/sessions",
        json("POST", body, { ...viaServe, "Sec-Fetch-Site": site, Origin: `https://${host}` }),
      );
      expect(res.status).toBe(403);
    }
    expect(
      (
        await app.request(
          "/api/bp/sessions",
          json("POST", body, { "Sec-Fetch-Site": "same-origin" }),
        )
      ).status,
    ).toBe(201);
    expect(
      (await app.request("/api/manual-exports", bodyless("POST", { "Sec-Fetch-Site": "none" })))
        .status,
    ).toBe(201);
  });

  it("refuses a cross-origin Origin when Sec-Fetch-Site is missing", async () => {
    for (const origin of ["https://evil.example", `http://${host}`, "null"]) {
      const res = await app.request(
        "/api/bp/sessions",
        json("POST", body, { ...viaServe, Origin: origin }),
      );
      expect(res.status).toBe(403);
    }
  });

  it("accepts the app's own origin through Tailscale Serve", async () => {
    const res = await app.request(
      "http://127.0.0.1:8787/api/bp/sessions",
      json("POST", body, { ...viaServe, Origin: `https://${host}` }),
    );
    expect(res.status).toBe(201);
  });

  it("accepts the app's own origin when not proxied", async () => {
    const res = await app.request(
      "http://127.0.0.1:8787/api/bp/sessions",
      json("POST", body, { Host: "127.0.0.1:8787", Origin: "http://127.0.0.1:8787" }),
    );
    expect(res.status).toBe(201);
  });

  it("accepts non-browser requests, which send no Origin", async () => {
    expect((await app.request("/api/bp/sessions", json("POST", body, viaServe))).status).toBe(201);
  });
});
