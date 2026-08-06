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
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;

export const UpdateAppSettingsBodySchema = z.object({
  registrationEnabled: z.boolean(),
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
