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

/** Manual exports older than this prompt a reminder to export again. */
export const MANUAL_EXPORT_DUE_AFTER_DAYS = 30;

export const manualExportStatusSchema = z.object({
  lastExportedAt: z.string().nullable(),
  due: z.boolean(),
});
export type ManualExportStatus = z.infer<typeof manualExportStatusSchema>;

export const backupStatusSchema = z.object({
  replica: backupKindStatusSchema,
  /** The automatic Google Drive export, which is optional. */
  export: backupKindStatusSchema,
  /** Copies saved by hand from the app, e.g. to Google Drive via the share sheet. */
  manualExport: manualExportStatusSchema,
});
export type BackupStatus = z.infer<typeof backupStatusSchema>;

export const BACKUP_KIND_LABELS: Record<BackupKind, string> = {
  replica: "Cloud backup (Cloudflare R2)",
  export: "Automatic export (Google Drive)",
};
