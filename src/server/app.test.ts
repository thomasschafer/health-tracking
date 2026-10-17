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

let app: Hono;
beforeEach(() => {
  app = createApp({
    db: openDatabase(":memory:"),
    now: () => new Date("2026-10-17T20:10:00.000Z"),
    backupStatus: () => ({
      replica: { state: "not-configured" },
      export: { state: "not-configured" },
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

    expect((await app.request(`/api/bp/sessions/${id}`, { method: "DELETE" })).status).toBe(204);
    expect((await app.request(`/api/bp/sessions/${id}`)).status).toBe(404);
    expect((await app.request(`/api/bp/sessions/${id}/restore`, { method: "POST" })).status).toBe(
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

describe("settings API", () => {
  it("returns defaults and saves changes", async () => {
    expect(await (await app.request("/api/settings")).json()).toEqual({
      settings: { readingsPerSession: 3 },
    });
    const res = await app.request("/api/settings", json("PUT", { readingsPerSession: 1 }));
    expect(await res.json()).toEqual({ settings: { readingsPerSession: 1 } });
    expect(
      (await app.request("/api/settings", json("PUT", { readingsPerSession: 9 }))).status,
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
