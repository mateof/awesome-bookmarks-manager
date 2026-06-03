import { z } from "zod";
import { UserRoleSchema } from "./auth.js";

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
