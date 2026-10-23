import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

const optionalNonEmpty = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === "" ? undefined : v.trim()));

const envSchema = z.object({
  HEALTH_DATA_DIR: z
    .string()
    .min(1)
    .default(join(homedir(), ".local", "share", "health-tracking")),
  HEALTH_HOST: z.string().min(1).default("127.0.0.1"),
  HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  /**
   * "tailscale" only accepts API requests that Tailscale Serve forwards from the tailnet user this
   * machine is logged in as. "none" accepts anything that reaches the port, for development and
   * tests.
   */
  HEALTH_AUTH: z.enum(["tailscale", "none"]).default("tailscale"),
  /** Path to the Litestream config. Replica verification is disabled when unset. */
  LITESTREAM_CONFIG: optionalNonEmpty,
  LITESTREAM_BIN: z.string().min(1).default("litestream"),
  GOOGLE_OAUTH_CLIENT_ID: optionalNonEmpty,
  GOOGLE_OAUTH_CLIENT_SECRET: optionalNonEmpty,
  GOOGLE_OAUTH_REFRESH_TOKEN: optionalNonEmpty,
  HEALTH_BACKUP_CHECK_INTERVAL_HOURS: z.coerce.number().positive().default(24),
});

export interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface Config {
  dataDir: string;
  databasePath: string;
  host: string;
  port: number;
  auth: "tailscale" | "none";
  litestream: { bin: string; configPath: string } | null;
  google: GoogleCredentials | null;
  backupCheckIntervalHours: number;
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const parsed = envSchema.parse(env);
  const googleParts = [
    parsed.GOOGLE_OAUTH_CLIENT_ID,
    parsed.GOOGLE_OAUTH_CLIENT_SECRET,
    parsed.GOOGLE_OAUTH_REFRESH_TOKEN,
  ];
  const googleSet = googleParts.filter((p) => p !== undefined).length;
  if (googleSet !== 0 && googleSet !== googleParts.length) {
    throw new Error(
      "GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET and GOOGLE_OAUTH_REFRESH_TOKEN must be set together",
    );
  }
  return {
    dataDir: parsed.HEALTH_DATA_DIR,
    databasePath: join(parsed.HEALTH_DATA_DIR, "health.db"),
    host: parsed.HEALTH_HOST,
    port: parsed.HEALTH_PORT,
    auth: parsed.HEALTH_AUTH,
    litestream:
      parsed.LITESTREAM_CONFIG === undefined
        ? null
        : { bin: parsed.LITESTREAM_BIN, configPath: parsed.LITESTREAM_CONFIG },
    google:
      parsed.GOOGLE_OAUTH_CLIENT_ID !== undefined &&
      parsed.GOOGLE_OAUTH_CLIENT_SECRET !== undefined &&
      parsed.GOOGLE_OAUTH_REFRESH_TOKEN !== undefined
        ? {
            clientId: parsed.GOOGLE_OAUTH_CLIENT_ID,
            clientSecret: parsed.GOOGLE_OAUTH_CLIENT_SECRET,
            refreshToken: parsed.GOOGLE_OAUTH_REFRESH_TOKEN,
          }
        : null,
    backupCheckIntervalHours: parsed.HEALTH_BACKUP_CHECK_INTERVAL_HOURS,
  };
}
