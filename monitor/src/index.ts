import { z } from "zod";
import { checkBackups, type StoredObject, type Todoist } from "./check.ts";

interface Env {
  BACKUPS: R2Bucket;
  TODOIST_TOKEN: string;
  STALE_AFTER_HOURS: string;
}

const TODOIST_API = "https://api.todoist.com/api/v1";

const tasksResponse = z.object({
  results: z.array(z.object({ id: z.string(), content: z.string() })),
});

/** Lists every object's key and upload time. Only metadata is read, never the backups. */
async function listObjects(bucket: R2Bucket): Promise<StoredObject[]> {
  const objects: StoredObject[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list(cursor === undefined ? {} : { cursor });
    objects.push(...page.objects.map((o) => ({ key: o.key, uploaded: o.uploaded })));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor !== undefined);
  return objects;
}

function todoistClient(token: string): Todoist {
  if (token === "") throw new Error("TODOIST_TOKEN is not set");
  const call = async (method: string, path: string, body?: unknown): Promise<Response> => {
    const res = await fetch(`${TODOIST_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!res.ok)
      throw new Error(
        `Todoist ${method} ${path} failed with ${String(res.status)}: ${await res.text()}`,
      );
    return res;
  };
  return {
    async findOpenTasks(search) {
      const query = encodeURIComponent(`search: ${search}`);
      const res = await call("GET", `/tasks/filter?query=${query}&limit=200`);
      return tasksResponse.parse(await res.json()).results;
    },
    async createTask(content, description) {
      await call("POST", "/tasks", { content, description, due_string: "today", priority: 3 });
    },
    async closeTask(id) {
      await call("POST", `/tasks/${id}/close`);
    },
  };
}

export default {
  async scheduled(_controller, env) {
    const outcome = await checkBackups({
      objects: await listObjects(env.BACKUPS),
      now: new Date(),
      staleAfterHours: Number(env.STALE_AFTER_HOURS),
      todoist: todoistClient(env.TODOIST_TOKEN),
    });
    console.log(JSON.stringify(outcome));
  },
} satisfies ExportedHandler<Env>;
