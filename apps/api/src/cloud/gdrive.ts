import { google, type Auth, type drive_v3 } from "googleapis";
import { Readable } from "node:stream";
import { getEnv } from "../env.js";
import type { CloudProvider, FileMeta, StoredCredentials } from "./types.js";

const APP_FOLDER = "AwesomeBookmarks";

export class GoogleDriveProvider implements CloudProvider {
  readonly id = "gdrive" as const;
  private readonly drive: drive_v3.Drive;
  private folderId: string | undefined;

  constructor(creds: Extract<StoredCredentials, { kind: "gdrive" }>) {
    const env = getEnv();
    const oauth = new google.auth.OAuth2(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      env.GOOGLE_REDIRECT_URI,
    );
    oauth.setCredentials({
      access_token: creds.accessToken,
      refresh_token: creds.refreshToken,
      expiry_date: creds.expiryDate,
    });
    this.drive = google.drive({ version: "v3", auth: oauth });
    this.folderId = creds.folderId;
  }

  private async ensureFolder(): Promise<string> {
    if (this.folderId) return this.folderId;
    const found = await this.drive.files.list({
      q: `name='${APP_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id,name)",
      pageSize: 1,
    });
    if (found.data.files && found.data.files.length > 0) {
      this.folderId = found.data.files[0]!.id ?? undefined;
      if (this.folderId) return this.folderId;
    }
    const created = await this.drive.files.create({
      requestBody: {
        name: APP_FOLDER,
        mimeType: "application/vnd.google-apps.folder",
      },
      fields: "id",
    });
    this.folderId = created.data.id ?? undefined;
    if (!this.folderId) throw new Error("Could not create gdrive app folder");
    return this.folderId;
  }

  async upload(path: string, stream: Readable): Promise<void> {
    const folderId = await this.ensureFolder();
    await this.drive.files.create({
      requestBody: { name: path, parents: [folderId] },
      media: { body: stream },
      fields: "id",
    });
  }

  async download(path: string): Promise<Readable> {
    const folderId = await this.ensureFolder();
    const found = await this.drive.files.list({
      q: `name='${path.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`,
      fields: "files(id)",
      pageSize: 1,
    });
    const file = found.data.files?.[0];
    if (!file?.id) throw new Error(`File not found: ${path}`);
    const res = await this.drive.files.get(
      { fileId: file.id, alt: "media" },
      { responseType: "stream" },
    );
    return res.data as Readable;
  }

  async list(_prefix: string): Promise<FileMeta[]> {
    const folderId = await this.ensureFolder();
    const res = await this.drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "files(id,name,size,modifiedTime)",
      orderBy: "modifiedTime desc",
      pageSize: 100,
    });
    return (res.data.files ?? []).map((f) => ({
      path: f.name ?? "",
      name: f.name ?? "",
      size: Number(f.size ?? 0),
      modifiedAt: f.modifiedTime ?? "",
    }));
  }

  async delete(path: string): Promise<void> {
    const folderId = await this.ensureFolder();
    const found = await this.drive.files.list({
      q: `name='${path.replace(/'/g, "\\'")}' and '${folderId}' in parents`,
      fields: "files(id)",
      pageSize: 1,
    });
    const file = found.data.files?.[0];
    if (!file?.id) return;
    await this.drive.files.delete({ fileId: file.id });
  }
}

export function gdriveOAuthClient(): Auth.OAuth2Client {
  const env = getEnv();
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI,
  );
}

export const GDRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
];
