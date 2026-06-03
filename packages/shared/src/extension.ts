import { z } from "zod";

export const CreateExtensionTokenBodySchema = z.object({
  label: z.string().min(1).max(128).default("default"),
});
export type CreateExtensionTokenBody = z.infer<
  typeof CreateExtensionTokenBodySchema
>;

export const CreateExtensionTokenResponseSchema = z.object({
  token: z.string(),
  label: z.string(),
});
export type CreateExtensionTokenResponse = z.infer<
  typeof CreateExtensionTokenResponseSchema
>;

export const QuickAddBodySchema = z.object({
  url: z.string().url().max(8192),
  title: z.string().min(1).max(1024).optional(),
  folderId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().min(1).max(64)).optional(),
});
export type QuickAddBody = z.infer<typeof QuickAddBodySchema>;
