import { z } from "zod";
import type { GoogleCredentials } from "../config.ts";

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const EXPORT_FOLDER_NAME = "Health tracking exports";

const tokenSchema = z.object({ access_token: z.string() });
const fileListSchema = z.object({ files: z.array(z.object({ id: z.string(), name: z.string() })) });
const fileSchema = z.object({ id: z.string() });

export interface ExportTarget {
  /** Creates or replaces the file with this name and returns its ID. */
  upload(name: string, content: string, mimeType: string): Promise<string>;
  download(id: string): Promise<string>;
}

async function expectOk(res: Response, action: string): Promise<Response> {
  if (!res.ok) {
    throw new Error(
      `Google Drive ${action} failed with ${String(res.status)}: ${await res.text()}`,
    );
  }
  return res;
}

const escapeQuery = (value: string) => value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");

/**
 * Uploads exports into a folder the app creates in the user's Drive. The drive.file scope means
 * the app can only see files it created, not anything else in the Drive.
 */
export function driveTarget(
  credentials: GoogleCredentials,
  fetchFn: typeof fetch = fetch,
): ExportTarget {
  let folderId: Promise<string> | null = null;

  const accessToken = async (): Promise<string> => {
    const res = await expectOk(
      await fetchFn("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: credentials.clientId,
          client_secret: credentials.clientSecret,
          refresh_token: credentials.refreshToken,
          grant_type: "refresh_token",
        }),
      }),
      "token refresh",
    );
    return tokenSchema.parse(await res.json()).access_token;
  };

  const findFiles = async (token: string, query: string) => {
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("q", `${query} and trashed = false`);
    url.searchParams.set("fields", "files(id,name)");
    url.searchParams.set("spaces", "drive");
    const res = await expectOk(
      await fetchFn(url, { headers: { Authorization: `Bearer ${token}` } }),
      "file search",
    );
    return fileListSchema.parse(await res.json()).files;
  };

  const ensureFolder = async (token: string): Promise<string> => {
    const existing = await findFiles(
      token,
      `name = '${escapeQuery(EXPORT_FOLDER_NAME)}' and mimeType = 'application/vnd.google-apps.folder'`,
    );
    if (existing.length > 1) {
      throw new Error(
        `Found ${String(existing.length)} "${EXPORT_FOLDER_NAME}" folders; expected one`,
      );
    }
    if (existing[0] !== undefined) return existing[0].id;
    const res = await expectOk(
      await fetchFn("https://www.googleapis.com/drive/v3/files?fields=id", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: EXPORT_FOLDER_NAME,
          mimeType: "application/vnd.google-apps.folder",
        }),
      }),
      "folder creation",
    );
    return fileSchema.parse(await res.json()).id;
  };

  return {
    async upload(name, content, mimeType) {
      const token = await accessToken();
      folderId ??= ensureFolder(token).catch((err: unknown) => {
        folderId = null;
        throw err;
      });
      const parent = await folderId;
      const existing = await findFiles(
        token,
        `name = '${escapeQuery(name)}' and '${parent}' in parents`,
      );
      if (existing.length > 1) {
        throw new Error(
          `Found ${String(existing.length)} files named "${name}"; expected at most one`,
        );
      }
      const metadata = existing[0] === undefined ? { name, parents: [parent] } : { name };
      const boundary = `health-${crypto.randomUUID()}`;
      const body = [
        `--${boundary}`,
        "Content-Type: application/json; charset=UTF-8",
        "",
        JSON.stringify(metadata),
        `--${boundary}`,
        `Content-Type: ${mimeType}`,
        "",
        content,
        `--${boundary}--`,
        "",
      ].join("\r\n");
      const url =
        existing[0] === undefined
          ? "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id"
          : `https://www.googleapis.com/upload/drive/v3/files/${existing[0].id}?uploadType=multipart&fields=id`;
      const res = await expectOk(
        await fetchFn(url, {
          method: existing[0] === undefined ? "POST" : "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body,
        }),
        "upload",
      );
      return fileSchema.parse(await res.json()).id;
    },

    async download(id) {
      const token = await accessToken();
      const res = await expectOk(
        await fetchFn(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        "download",
      );
      return res.text();
    },
  };
}
