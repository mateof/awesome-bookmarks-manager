import { z } from "zod";

// CSS color values: hex (`#rrggbb`, `#rrggbbaa`) or `rgba(...)` are the
// only forms we set; we accept null to clear.
const BgColor = z
  .string()
  .max(40)
  .regex(/^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))$/, "Invalid color");

export const FolderSchema = z.object({
  id: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  iconBlobPath: z.string().nullable(),
  imageBlobPath: z.string().nullable(),
  bgColor: z.string().nullable().optional(),
  shareOrigin: z.string().nullable().default(null),
  position: z.number().int(),
  rev: z.number().int().default(1),
  tagIds: z.array(z.string().uuid()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Folder = z.infer<typeof FolderSchema>;

export const CreateFolderBodySchema = z.object({
  parentId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(256),
  description: z.string().max(1_000_000).optional(),
  tagIds: z.array(z.string().uuid()).optional(),
  bgColor: BgColor.nullable().optional(),
});
export type CreateFolderBody = z.infer<typeof CreateFolderBodySchema>;

export const UpdateFolderBodySchema = z.object({
  name: z.string().min(1).max(256).optional(),
  description: z.string().max(1_000_000).nullable().optional(),
  tagIds: z.array(z.string().uuid()).optional(),
  bgColor: BgColor.nullable().optional(),
  // Optimistic concurrency: the rev the client last saw. When present and it
  // no longer matches the stored row, the update is rejected with 409.
  baseRev: z.number().int().optional(),
});
export type UpdateFolderBody = z.infer<typeof UpdateFolderBodySchema>;

export const MoveFolderBodySchema = z.object({
  newParentId: z.string().uuid().nullable(),
  position: z.number().int().min(0),
});
export type MoveFolderBody = z.infer<typeof MoveFolderBodySchema>;
