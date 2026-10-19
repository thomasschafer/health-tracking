import { z } from "zod";
import type { Todoist } from "./check.ts";

const TODOIST_API = "https://api.todoist.com/api/v1";

const tasksResponse = z.object({
  results: z.array(z.object({ id: z.string(), content: z.string() })),
});

export function todoistClient(token: string): Todoist {
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
