import { fileURLToPath } from "node:url";

// Development runs on its own port and data directory, so it never touches an installed copy of
// the app, its database or its backups. The e2e tests use 8788.
export const DEV_API_PORT = 8789;
export const DEV_DATA_DIR = fileURLToPath(new URL("../.dev-data", import.meta.url));
