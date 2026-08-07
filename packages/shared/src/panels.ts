import { z } from "zod";
import { EmailSchema } from "./auth.js";

/* ------------------------------------------------------------------ */
/* Template config (the "look" of a panel). Structured JSON, not HTML, */
/* so it is safe to render on public pages and easy to import/export.  */
/* ------------------------------------------------------------------ */

export const PanelLayoutSchema = z.enum([
  "grid",
  "list",
  "bento",
  "terminal",
  "dashboard",
]);
export type PanelLayout = z.infer<typeof PanelLayoutSchema>;

export const TemplateThemeSchema = z.object({
  bg: z.string().max(400),
  surface: z.string().max(400),
  text: z.string().max(64),
  muted: z.string().max(64),
  accent: z.string().max(64),
  border: z.string().max(64),
});

export const TemplateCardSchema = z.object({
  radius: z.string().max(32),
  shadow: z.boolean(),
  showIcon: z.boolean(),
  showDescription: z.boolean(),
  showUrl: z.boolean(),
  showTags: z.boolean(),
});

export const TemplateConfigSchema = z.object({
  layout: PanelLayoutSchema,
  columns: z.number().int().min(1).max(8).optional(),
  theme: TemplateThemeSchema,
  card: TemplateCardSchema,
  font: z.string().max(200).optional(),
  header: z.enum(["banner", "minimal", "hidden"]).optional(),
  /** Show the tag filter bar in the panel (default true). */
  tagFilter: z.boolean().optional(),
});
export type TemplateConfig = z.infer<typeof TemplateConfigSchema>;

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

export const CreateTemplateBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  config: TemplateConfigSchema,
});
export type CreateTemplateBody = z.infer<typeof CreateTemplateBodySchema>;

export const UpdateTemplateBodySchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  config: TemplateConfigSchema.optional(),
});
export type UpdateTemplateBody = z.infer<typeof UpdateTemplateBodySchema>;

export interface TemplateItem {
  id: string;
  name: string;
  config: TemplateConfig;
  builtin: boolean;
  createdAt?: string;
}

/* ------------------------------------------------------------------ */
/* Panels                                                              */
/* ------------------------------------------------------------------ */

export const PanelAccessModeSchema = z.enum(["public", "password", "users"]);
export type PanelAccessMode = z.infer<typeof PanelAccessModeSchema>;

export const PanelSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/, "Solo minúsculas, números y guiones");

export const CreatePanelBodySchema = z.object({
  title: z.string().trim().min(1).max(120),
  slug: PanelSlugSchema,
  folderId: z.string().uuid(),
  templateId: z.string().max(64).nullable().optional(),
  accessMode: PanelAccessModeSchema,
  password: z.string().min(1).max(200).optional(),
  userEmails: z.array(EmailSchema).max(500).optional(),
});
export type CreatePanelBody = z.infer<typeof CreatePanelBodySchema>;

export const UpdatePanelBodySchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  slug: PanelSlugSchema.optional(),
  templateId: z.string().max(64).nullable().optional(),
  accessMode: PanelAccessModeSchema.optional(),
  // "" clears the password; omitted keeps it; a value sets it.
  password: z.string().max(200).optional(),
  userEmails: z.array(EmailSchema).max(500).optional(),
});
export type UpdatePanelBody = z.infer<typeof UpdatePanelBodySchema>;

export interface PanelListItem {
  id: string;
  slug: string;
  title: string;
  folderId: string;
  templateId: string | null;
  accessMode: PanelAccessMode;
  hasPassword: boolean;
  userCount: number;
  status: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

export interface PanelDetail extends PanelListItem {
  userEmails: string[];
}

/* ------------------------------------------------------------------ */
/* Materialized payload + public view                                  */
/* ------------------------------------------------------------------ */

export interface PanelBookmark {
  id: string;
  title: string;
  url: string;
  description: string | null;
  tags: { name: string; color: string }[];
}

export interface PanelFolder {
  id: string;
  name: string;
  description: string | null;
  bookmarks: PanelBookmark[];
  subfolders: PanelFolder[];
}

export interface PublicPanelResponse {
  title: string;
  template: TemplateConfig;
  /** Present only when unlocked/authorized. */
  root?: PanelFolder;
  needsPassword?: boolean;
  needsAuth?: boolean;
  forbidden?: boolean;
}
