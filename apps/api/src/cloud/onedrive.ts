import { Readable } from "node:stream";
import { request } from "undici";
import { getEnv } from "../env.js";
import type { CloudProvider, FileMeta, StoredCredentials } from "./types.js";

const APP_FOLDER = "AwesomeBookmarks";
const GRAPH = "https://graph.microsoft.com/v1.0";

/**
 * OneDrive provider via Microsoft Graph. Uses the special /me/drive/special/approot
 * folder by requesting Files.ReadWrite.AppFolder scope. Refresh-token flow is
 * handled inline with the public OAuth endpoint.
 */
export class OneDriveProvider implements CloudProvider {
  readonly id = "onedrive" as const;
  private accessToken: string;
  private refreshToken: string;
  private expiryDate: number;

  constructor(creds: Extract<StoredCredentials, { kind: "onedrive" }>) {
    this.accessToken = creds.accessToken;
    this.refreshToken = creds.refreshToken;
    this.expiryDate = creds.expiryDate;
  }

  private async token(): Promise<string> {
    if (Date.now() < this.expiryDate - 60_000) return this.accessToken;
    const env = getEnv();
    const res = await request(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: env.MS_CLIENT_ID ?? "",
          client_secret: env.MS_CLIENT_SECRET ?? "",
          grant_type: "refresh_token",
          refresh_token: this.refreshToken,
        }).toString(),
      },
    );
    if (res.statusCode !== 200) {
      throw new Error(`OneDrive token refresh failed: ${res.statusCode}`);
    }
    const json = (await res.body.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };
    this.accessToken = json.access_token;
    if (json.refresh_token) this.refreshToken = json.refresh_token;
    this.expiryDate = Date.now() + json.expires_in * 1000;
    return this.accessToken;
  }

  private async path(p: string) {
    return `${GRAPH}/me/drive/special/approot:/${encodeURIComponent(p)}`;
  }

  async upload(path: string, stream: Readable): Promise<void> {
    const token = await this.token();
    // Simple upload (<=4MB). Backups are typically larger, so use upload session.
    const session = await request(
      `${await this.path(path)}:/createUploadSession`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "replace" } }),
      },
    );
    if (session.statusCode !== 200) {
      throw new Error(`OneDrive createUploadSession failed: ${session.statusCode}`);
    }
    const { uploadUrl } = (await session.body.json()) as { uploadUrl: string };

    // Stream chunked upload (10 MiB chunks).
    const CHUNK = 10 * 1024 * 1024;
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const c of stream) {
      const buf = Buffer.isBuffer(c) ? c : Buffer.from(c as Uint8Array);
      chunks.push(buf);
      total += buf.length;
    }
    const data = Buffer.concat(chunks);
    let start = 0;
    while (start < total) {
      const end = Math.min(start + CHUNK, total) - 1;
      const slice = data.subarray(start, end + 1);
      const r = await request(uploadUrl, {
        method: "PUT",
        headers: {
          "content-length": String(slice.length),
          "content-range": `bytes ${start}-${end}/${total}`,
        },
        body: slice,
      });
      if (r.statusCode >= 300) {
        throw new Error(`OneDrive upload chunk failed: ${r.statusCode}`);
      }
      await r.body.dump();
      start = end + 1;
    }
  }

  async download(path: string): Promise<Readable> {
    const token = await this.token();
    const r = await request(`${await this.path(path)}:/content`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (r.statusCode !== 200 && r.statusCode !== 302) {
      throw new Error(`OneDrive download failed: ${r.statusCode}`);
    }
    return Readable.fromWeb(
      r.body as unknown as Parameters<typeof Readable.fromWeb>[0],
    ) as unknown as Readable;
  }

  async list(_prefix: string): Promise<FileMeta[]> {
    const token = await this.token();
    const r = await request(
      `${GRAPH}/me/drive/special/approot/children?$select=name,size,lastModifiedDateTime&$orderby=lastModifiedDateTime desc&$top=100`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (r.statusCode !== 200) return [];
    const json = (await r.body.json()) as {
      value: Array<{ name: string; size: number; lastModifiedDateTime: string }>;
    };
    return json.value.map((v) => ({
      path: v.name,
      name: v.name,
      size: v.size,
      modifiedAt: v.lastModifiedDateTime,
    }));
  }

  async delete(path: string): Promise<void> {
    const token = await this.token();
    const r = await request(await this.path(path), {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    await r.body.dump();
  }
}

export const ONEDRIVE_SCOPES = [
  "offline_access",
  "Files.ReadWrite.AppFolder",
  "User.Read",
];
