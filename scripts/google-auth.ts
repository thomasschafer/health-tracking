import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { z } from "zod";
import { DRIVE_SCOPE } from "../src/server/backup/drive.ts";

// One-off helper that runs Google's OAuth flow for a desktop app and prints a refresh token for
// GOOGLE_OAUTH_REFRESH_TOKEN. Needs GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET set.

const env = z
  .object({
    GOOGLE_OAUTH_CLIENT_ID: z.string().min(1),
    GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1),
  })
  .parse(process.env);

const verifier = randomBytes(32).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
const state = randomBytes(16).toString("hex");

const code = await new Promise<{ code: string; redirectUri: string }>((resolve, reject) => {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== "/callback") {
      res.writeHead(404).end();
      return;
    }
    const error = url.searchParams.get("error");
    const received = url.searchParams.get("code");
    if (error !== null || received === null || url.searchParams.get("state") !== state) {
      res.writeHead(400).end("Authorisation failed. Check the terminal.");
      server.close();
      reject(new Error(`Authorisation failed: ${error ?? "missing code or state mismatch"}`));
      return;
    }
    res.writeHead(200, { "Content-Type": "text/plain" }).end("Done. You can close this tab.");
    const address = server.address();
    server.close();
    if (address === null || typeof address === "string") {
      reject(new Error("Unexpected server address"));
      return;
    }
    resolve({ code: received, redirectUri: `http://127.0.0.1:${String(address.port)}/callback` });
  });
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (address === null || typeof address === "string") {
      reject(new Error("Unexpected server address"));
      return;
    }
    const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    auth.search = new URLSearchParams({
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      redirect_uri: `http://127.0.0.1:${String(address.port)}/callback`,
      response_type: "code",
      scope: DRIVE_SCOPE,
      access_type: "offline",
      prompt: "consent",
      code_challenge: challenge,
      code_challenge_method: "S256",
      state,
    }).toString();
    console.log(`Open this URL in a browser and approve access:\n\n${auth.toString()}\n`);
  });
});

const res = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    code: code.code,
    code_verifier: verifier,
    redirect_uri: code.redirectUri,
    grant_type: "authorization_code",
  }),
});
if (!res.ok) {
  throw new Error(`Token exchange failed with ${String(res.status)}: ${await res.text()}`);
}
const tokens = z.object({ refresh_token: z.string() }).parse(await res.json());
console.log(`GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`);
