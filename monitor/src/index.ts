import { checkBackups, type StoredObject } from "./check.ts";
import { todoistClient } from "./todoist.ts";

interface Env {
  BACKUPS: R2Bucket;
  TODOIST_TOKEN: string;
  STALE_AFTER_HOURS: string;
}

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
