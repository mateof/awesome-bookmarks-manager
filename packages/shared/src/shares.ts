import { z } from "zod";

export const ShareTargetTypeSchema = z.enum(["folder", "bookmark"]);
export type ShareTargetType = z.infer<typeof ShareTargetTypeSchema>;

export const CreateShareBodySchema = z.object({
  targetType: ShareTargetTypeSchema,
  targetId: z.string().uuid(),
  expiresAt: z.string().datetime().nullable().optional(),
  password: z.string().min(4).max(1024).nullable().optional(),
});
export type CreateShareBody = z.infer<typeof CreateShareBodySchema>;

export const ShareSchema = z.object({
  id: z.string().uuid(),
  targetType: ShareTargetTypeSchema,
  targetId: z.string().uuid(),
  token: z.string(),
  url: z.string().url(),
  expiresAt: z.string().datetime().nullable(),
  hasPassword: z.boolean(),
  createdAt: z.string(),
});
export type Share = z.infer<typeof ShareSchema>;

export const PublicShareUnlockBodySchema = z.object({
  password: z.string().min(1).max(1024).optional(),
});
export type PublicShareUnlockBody = z.infer<typeof PublicShareUnlockBodySchema>;
