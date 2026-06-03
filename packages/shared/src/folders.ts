import { z } from "zod";

export const FolderSchema = z.object({
  id: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  iconBlobPath: z.string().nullable(),
  imageBlobPath: z.string().nullable(),
  position: z.number().int(),
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
});
export type CreateFolderBody = z.infer<typeof CreateFolderBodySchema>;

export const UpdateFolderBodySchema = z.object({
  name: z.string().min(1).max(256).optional(),
  description: z.string().max(1_000_000).nullable().optional(),
  tagIds: z.array(z.string().uuid()).optional(),
});
export type UpdateFolderBody = z.infer<typeof UpdateFolderBodySchema>;

export const MoveFolderBodySchema = z.object({
  newParentId: z.string().uuid().nullable(),
  position: z.number().int().min(0),
});
export type MoveFolderBody = z.infer<typeof MoveFolderBodySchema>;
