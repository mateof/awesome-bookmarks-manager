import type { CloudProviderId } from "@awesome-bookmarks/shared";
import type { Readable } from "node:stream";

export interface FileMeta {
  path: string;
  name: string;
  size: number;
  modifiedAt: string;
}

export interface CloudProvider {
  readonly id: CloudProviderId;

  /** Upload a stream to a path. Path is relative to the provider's app root. */
  upload(path: string, stream: Readable, size?: number): Promise<void>;

  /** Download a path as a stream. */
  download(path: string): Promise<Readable>;

  /** List files matching a prefix (sorted by modifiedAt desc). */
  list(prefix: string): Promise<FileMeta[]>;

  /** Delete a single file. */
  delete(path: string): Promise<void>;
}

/**
 * Stored credentials shape, encrypted with the user DEK in the DB.
 * Each provider serializes its own concrete shape into the credentialsCt blob.
 */
export type StoredCredentials =
  | {
      kind: "gdrive";
      accessToken: string;
      refreshToken: string;
      expiryDate: number;
      folderId?: string;
    }
  | {
      kind: "onedrive";
      accessToken: string;
      refreshToken: string;
      expiryDate: number;
    }
  | {
      kind: "synology_webdav";
      url: string;
      username: string;
      password: string;
      basePath: string;
    };
