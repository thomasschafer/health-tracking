import { z } from "zod";

export const BACKUP_KINDS = ["replica", "export"] as const;
export type BackupKind = (typeof BACKUP_KINDS)[number];

/** A backup check older than this counts as stale, since checks are meant to run daily. */
export const BACKUP_STALE_AFTER_HOURS = 36;

export const backupKindStatusSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("not-configured") }),
  z.object({ state: z.literal("ok"), checkedAt: z.string() }),
  z.object({ state: z.literal("failing"), checkedAt: z.string(), detail: z.string() }),
  z.object({ state: z.literal("stale"), lastOkAt: z.string().nullable() }),
]);
export type BackupKindStatus = z.infer<typeof backupKindStatusSchema>;

export const backupStatusSchema = z.object({
  replica: backupKindStatusSchema,
  export: backupKindStatusSchema,
});
export type BackupStatus = z.infer<typeof backupStatusSchema>;

export const BACKUP_KIND_LABELS: Record<BackupKind, string> = {
  replica: "Cloud backup (Cloudflare R2)",
  export: "Daily export (Google Drive)",
};
