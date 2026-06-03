import { z } from "zod";

export const EmailSchema = z.string().email().max(254).toLowerCase();

export const PasswordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(1024);

/**
 * Nickname format — case-insensitive on storage, displayed as user typed.
 * Allowed: 3-32 chars, letters, digits, dot, underscore, hyphen.
 */
export const NicknameSchema = z
  .string()
  .trim()
  .min(3, "El nickname debe tener al menos 3 caracteres")
  .max(32)
  .regex(
    /^[a-zA-Z0-9._-]+$/,
    "Solo letras, números y los símbolos . _ -",
  );

export const SignupBodySchema = z.object({
  email: EmailSchema,
  nickname: NicknameSchema,
  password: PasswordSchema,
});
export type SignupBody = z.infer<typeof SignupBodySchema>;

export const LoginBodySchema = z.object({
  /** Either the email or the nickname. */
  identifier: z.string().min(1).max(254),
  password: z.string().min(1).max(1024),
});
export type LoginBody = z.infer<typeof LoginBodySchema>;

export const UpdateProfileBodySchema = z.object({
  nickname: NicknameSchema.optional(),
  autoSnapshots: z.boolean().optional(),
});
export type UpdateProfileBody = z.infer<typeof UpdateProfileBodySchema>;

export const ChangePasswordBodySchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: PasswordSchema,
});
export type ChangePasswordBody = z.infer<typeof ChangePasswordBodySchema>;

export const UserRoleSchema = z.enum(["user", "admin"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const MeResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  nickname: z.string().nullable(),
  role: UserRoleSchema,
  autoSnapshots: z.boolean(),
  createdAt: z.string(),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;
