import { z } from "zod";
import { EmailSchema, NicknameSchema, PasswordSchema, UserRoleSchema } from "./auth.js";

export const AdminUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  role: UserRoleSchema,
  createdAt: z.string(),
  bookmarkCount: z.number().int(),
  folderCount: z.number().int(),
});
export type AdminUser = z.infer<typeof AdminUserSchema>;

export const UpdateUserRoleBodySchema = z.object({
  role: UserRoleSchema,
});
export type UpdateUserRoleBody = z.infer<typeof UpdateUserRoleBodySchema>;

export const AppSettingsSchema = z.object({
  registrationEnabled: z.boolean(),
  require2fa: z.boolean(),
  // Comma-free list of trusted IPv4 CIDRs (e.g. ["192.168.0.0/16"]).
  trustedNetworks: z.array(z.string()),
  skip2faOnTrusted: z.boolean(),
  /** Storage limit applied to users without their own override. null = none. */
  defaultStorageQuotaBytes: z.number().int().nullable(),
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;

// All fields optional so the UI can PATCH one toggle at a time.
export const UpdateAppSettingsBodySchema = z.object({
  registrationEnabled: z.boolean().optional(),
  require2fa: z.boolean().optional(),
  trustedNetworks: z.array(z.string().trim().max(64)).max(32).optional(),
  skip2faOnTrusted: z.boolean().optional(),
  // null removes the instance-wide limit; a number sets it in bytes.
  defaultStorageQuotaBytes: z
    .number()
    .int()
    .min(0)
    .max(1_000_000_000_000)
    .nullable()
    .optional(),
});
export type UpdateAppSettingsBody = z.infer<typeof UpdateAppSettingsBodySchema>;

export const CreateUserBodySchema = z.object({
  email: EmailSchema,
  nickname: NicknameSchema,
  // Optional: when omitted a one-time password is generated server-side.
  password: PasswordSchema.optional(),
});
export type CreateUserBody = z.infer<typeof CreateUserBodySchema>;

export const CreateUserResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  nickname: z.string(),
  role: z.literal("user"),
  oneTimePassword: z.string(),
});
export type CreateUserResponse = z.infer<typeof CreateUserResponseSchema>;
