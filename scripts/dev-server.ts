// Runs the API for development (`npm run dev:server`), with the defaults in dev.ts, accepting any
// request rather than only this machine's Tailscale login. Set HEALTH_PORT, HEALTH_DATA_DIR or
// HEALTH_AUTH to override them.
import { DEV_API_PORT, DEV_DATA_DIR } from "./dev.ts";

process.env["HEALTH_PORT"] ??= String(DEV_API_PORT);
process.env["HEALTH_DATA_DIR"] ??= DEV_DATA_DIR;
process.env["HEALTH_AUTH"] ??= "none";
await import("../src/server/main.ts");
