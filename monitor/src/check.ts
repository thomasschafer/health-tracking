/**
 * Decides whether the backups in R2 have gone stale and keeps a single Todoist task in step
 * with that. Kept free of Worker APIs so it can be tested in Node.
 */

export const ALERT_TITLE = "Health tracking backups have stopped";

export interface StoredObject {
  key: string;
  uploaded: Date;
}

export interface TodoistTask {
  id: string;
  content: string;
}

export interface Todoist {
  findOpenTasks(search: string): Promise<TodoistTask[]>;
  createTask(content: string, description: string): Promise<void>;
  closeTask(id: string): Promise<void>;
}

export type Outcome =
  | { kind: "fresh"; newest: Date }
  | { kind: "recovered"; newest: Date }
  | { kind: "alerted"; newest: Date | null }
  | { kind: "already-alerted"; newest: Date | null };

export interface CheckOptions {
  objects: readonly StoredObject[];
  now: Date;
  staleAfterHours: number;
  todoist: Todoist;
}

export async function checkBackups({
  objects,
  now,
  staleAfterHours,
  todoist,
}: CheckOptions): Promise<Outcome> {
  if (!Number.isFinite(staleAfterHours) || staleAfterHours <= 0) {
    throw new Error(`Invalid stale threshold: ${String(staleAfterHours)}`);
  }
  const newest = objects.reduce<Date | null>(
    (latest, o) => (latest === null || o.uploaded > latest ? o.uploaded : latest),
    null,
  );
  const stale = newest === null || now.getTime() - newest.getTime() > staleAfterHours * 3_600_000;
  const open = (await todoist.findOpenTasks(ALERT_TITLE)).filter((t) => t.content === ALERT_TITLE);

  if (!stale) {
    for (const task of open) await todoist.closeTask(task.id);
    return open.length > 0 ? { kind: "recovered", newest } : { kind: "fresh", newest };
  }
  if (open.length > 0) return { kind: "already-alerted", newest };

  const age =
    newest === null
      ? "There are no backups in the bucket at all."
      : `The newest backup is from ${newest.toISOString()}, ${String(Math.floor((now.getTime() - newest.getTime()) / 3_600_000))} hours ago.`;
  await todoist.createTask(
    ALERT_TITLE,
    [
      age,
      "Backups normally update at least daily while the laptop is awake, so the laptop has been off or asleep for days, or replication has broken.",
      "Check the laptop is on, then see the Running section of docs/operations.md in the health-tracking repo. This task closes itself once backups resume.",
    ].join("\n\n"),
  );
  return { kind: "alerted", newest };
}
