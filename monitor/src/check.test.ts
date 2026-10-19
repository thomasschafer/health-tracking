import { describe, expect, it } from "vitest";
import { ALERT_TITLE, checkBackups, type Todoist, type TodoistTask } from "./check.ts";

const now = new Date("2026-10-19T09:17:00.000Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

function fakeTodoist(open: TodoistTask[] = []) {
  const created: { content: string; description: string }[] = [];
  const closed: string[] = [];
  const todoist: Todoist = {
    findOpenTasks: () => Promise.resolve(open),
    createTask: (content, description) => {
      created.push({ content, description });
      return Promise.resolve();
    },
    closeTask: (id) => {
      closed.push(id);
      return Promise.resolve();
    },
  };
  return { todoist, created, closed };
}

const objects = (...hours: number[]) =>
  hours.map((h, i) => ({ key: `health.db/${String(i)}.ltx`, uploaded: hoursAgo(h) }));

describe("checkBackups", () => {
  it("does nothing while backups are recent", async () => {
    const { todoist, created, closed } = fakeTodoist();
    const outcome = await checkBackups({
      objects: objects(100, 5),
      now,
      staleAfterHours: 72,
      todoist,
    });
    expect(outcome).toEqual({ kind: "fresh", newest: hoursAgo(5) });
    expect(created).toEqual([]);
    expect(closed).toEqual([]);
  });

  it("creates one task when backups go stale", async () => {
    const { todoist, created } = fakeTodoist();
    const outcome = await checkBackups({
      objects: objects(200, 73),
      now,
      staleAfterHours: 72,
      todoist,
    });
    expect(outcome.kind).toBe("alerted");
    expect(created).toHaveLength(1);
    expect(created[0]?.content).toBe(ALERT_TITLE);
    expect(created[0]?.description).toContain("73 hours ago");
  });

  it("alerts when the bucket is empty", async () => {
    const { todoist, created } = fakeTodoist();
    expect((await checkBackups({ objects: [], now, staleAfterHours: 72, todoist })).kind).toBe(
      "alerted",
    );
    expect(created[0]?.description).toContain("no backups in the bucket");
  });

  it("doesn't repeat an alert that is still open", async () => {
    const { todoist, created } = fakeTodoist([{ id: "1", content: ALERT_TITLE }]);
    expect(
      (await checkBackups({ objects: objects(80), now, staleAfterHours: 72, todoist })).kind,
    ).toBe("already-alerted");
    expect(created).toEqual([]);
  });

  it("closes the alert once backups resume, ignoring unrelated tasks", async () => {
    const { todoist, closed } = fakeTodoist([
      { id: "1", content: ALERT_TITLE },
      { id: "2", content: `${ALERT_TITLE} (old note)` },
    ]);
    expect(
      (await checkBackups({ objects: objects(2), now, staleAfterHours: 72, todoist })).kind,
    ).toBe("recovered");
    expect(closed).toEqual(["1"]);
  });

  it("rejects a nonsensical threshold", async () => {
    await expect(
      checkBackups({
        objects: [],
        now,
        staleAfterHours: Number("x"),
        todoist: fakeTodoist().todoist,
      }),
    ).rejects.toThrow("Invalid stale threshold");
  });
});
