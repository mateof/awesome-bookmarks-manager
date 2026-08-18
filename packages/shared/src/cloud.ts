import { z } from "zod";

export const CloudProviderIdSchema = z.enum([
  "gdrive",
  "onedrive",
  "synology_webdav",
]);
export type CloudProviderId = z.infer<typeof CloudProviderIdSchema>;

export const CloudConnectionSchema = z.object({
  id: z.string().uuid(),
  provider: CloudProviderIdSchema,
  label: z.string(),
  backupScheduleCron: z.string().nullable(),
  lastBackupAt: z.string().datetime().nullable(),
  lastStatus: z.enum(["ok", "error", "running", "never"]),
  /** The user's primary vault; what the UI preselects for copy and restore. */
  isDefault: z.boolean().default(false),
  createdAt: z.string().datetime(),
});
export type CloudConnection = z.infer<typeof CloudConnectionSchema>;

export const ConnectSynologyBodySchema = z.object({
  label: z.string().min(1).max(128),
  url: z.string().url(),
  username: z.string().min(1).max(256),
  password: z.string().min(1).max(1024),
  basePath: z.string().default("/AwesomeBookmarks"),
});
export type ConnectSynologyBody = z.infer<typeof ConnectSynologyBodySchema>;

export const SynologyCredentialsSchema = z.object({
  url: z.string().url(),
  username: z.string().min(1).max(256),
  password: z.string().min(1).max(1024),
});
export type SynologyCredentials = z.infer<typeof SynologyCredentialsSchema>;

export const TestSynologyResponseSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
});
export type TestSynologyResponse = z.infer<typeof TestSynologyResponseSchema>;

export const ListSynologyDirsBodySchema = SynologyCredentialsSchema.extend({
  path: z.string().default("/"),
});
export type ListSynologyDirsBody = z.infer<typeof ListSynologyDirsBodySchema>;

export const SynologyDirEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
});
export type SynologyDirEntry = z.infer<typeof SynologyDirEntrySchema>;

export const CreateSynologyDirBodySchema = SynologyCredentialsSchema.extend({
  path: z.string().min(1),
});
export type CreateSynologyDirBody = z.infer<typeof CreateSynologyDirBodySchema>;

export const UpdateConnectionBodySchema = z.object({
  label: z.string().min(1).max(128).optional(),
  backupScheduleCron: z.string().nullable().optional(),
});
export type UpdateConnectionBody = z.infer<typeof UpdateConnectionBodySchema>;

export const RestoreBodySchema = z.object({
  connectionId: z.string().uuid(),
  backupPath: z.string(),
});
export type RestoreBody = z.infer<typeof RestoreBodySchema>;

/** One archive sitting in a cloud vault. */
export const CloudBackupSchema = z.object({
  path: z.string(),
  name: z.string(),
  size: z.number().int(),
  modifiedAt: z.string(),
});
export type CloudBackup = z.infer<typeof CloudBackupSchema>;

export const RestoreBackupBodySchema = z.object({
  filename: z.string().min(1).max(512),
});
export type RestoreBackupBody = z.infer<typeof RestoreBackupBodySchema>;

export const CopyBackupBodySchema = z.object({
  filename: z.string().min(1).max(512),
  targetConnectionId: z.string().uuid(),
});
export type CopyBackupBody = z.infer<typeof CopyBackupBodySchema>;
