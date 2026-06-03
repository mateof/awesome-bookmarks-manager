import { z } from "zod";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const TagSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  color: z.string().regex(HEX_COLOR),
});
export type Tag = z.infer<typeof TagSchema>;

export const CreateTagBodySchema = z.object({
  name: z.string().min(1).max(64),
  color: z.string().regex(HEX_COLOR).default("#64748b"),
});
export type CreateTagBody = z.infer<typeof CreateTagBodySchema>;

export const UpdateTagBodySchema = z.object({
  name: z.string().min(1).max(64).optional(),
  color: z.string().regex(HEX_COLOR).optional(),
});
export type UpdateTagBody = z.infer<typeof UpdateTagBodySchema>;
