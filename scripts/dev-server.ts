// Runs the API for development (`npm run dev:server`), with the defaults in dev.ts. Set
// HEALTH_PORT or HEALTH_DATA_DIR to override them.
import { DEV_API_PORT, DEV_DATA_DIR } from "./dev.ts";

process.env["HEALTH_PORT"] ??= String(DEV_API_PORT);
process.env["HEALTH_DATA_DIR"] ??= DEV_DATA_DIR;
await import("../src/server/main.ts");
