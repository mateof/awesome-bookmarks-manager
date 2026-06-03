import { aeadDecrypt, aeadEncrypt } from "@awesome-bookmarks/crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { cloudConnections } from "../db/schema.js";
import { NotFound } from "../util/errors.js";
import { GoogleDriveProvider } from "./gdrive.js";
import { OneDriveProvider } from "./onedrive.js";
import { SynologyWebDAVProvider } from "./synology.js";
import type { CloudProvider, StoredCredentials } from "./types.js";

export function buildProvider(creds: StoredCredentials): CloudProvider {
  switch (creds.kind) {
    case "gdrive":
      return new GoogleDriveProvider(creds);
    case "onedrive":
      return new OneDriveProvider(creds);
    case "synology_webdav":
      return new SynologyWebDAVProvider(creds);
  }
}

export function packCredentials(
  dek: Buffer,
  userId: string,
  creds: StoredCredentials,
): Buffer {
  return aeadEncrypt(dek, JSON.stringify(creds), `${userId}|cloud.creds`);
}

export function unpackCredentials(
  dek: Buffer,
  userId: string,
  blob: Buffer,
): StoredCredentials {
  const json = aeadDecrypt(dek, blob, `${userId}|cloud.creds`).toString("utf8");
  return JSON.parse(json) as StoredCredentials;
}

export function loadConnection(
  userId: string,
  connectionId: string,
  dek: Buffer,
): { provider: CloudProvider; creds: StoredCredentials; row: typeof cloudConnections.$inferSelect } {
  const row = getDb()
    .select()
    .from(cloudConnections)
    .where(eq(cloudConnections.id, connectionId))
    .get();
  if (!row || row.userId !== userId) throw NotFound("Connection not found");
  const creds = unpackCredentials(dek, userId, Buffer.from(row.credentialsCt));
  return { provider: buildProvider(creds), creds, row };
}
