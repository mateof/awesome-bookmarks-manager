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

/**
 * Built-in decorative background scenes (static or animated). Rendered as a
 * full-bleed layer behind the panel content. `"none"` (or omitted) keeps the
 * plain `theme.bg`. Stored as a free string (max 32) so new scenes can ship
 * without a schema migration; an unknown value renders as no scene.
 */
export const PANEL_SCENES = [
  "none",
  "galaxy",
  "aurora",
  "ocean",
  "beach",
  "fishtank",
  "clouds",
  "sakura",
  "dragonballs",
] as const;
export type PanelScene = (typeof PANEL_SCENES)[number];

export const TemplateConfigSchema = z.object({
  layout: PanelLayoutSchema,
  columns: z.number().int().min(1).max(8).optional(),
  theme: TemplateThemeSchema,
  card: TemplateCardSchema,
  font: z.string().max(200).optional(),
  header: z.enum(["banner", "minimal", "hidden"]).optional(),
  /** Show the tag filter bar in the panel (default true). */
  tagFilter: z.boolean().optional(),
  /** Decorative background scene id (see PANEL_SCENES). */
  scene: z.string().max(32).optional(),
  /**
   * When true, each folder that itself holds subfolders lists them beneath its
   * card so a whole level is browsable at a glance. Opening a child (or the
   * parent) navigates to that folder alone.
   */
  folderPreview: z.boolean().optional(),
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

/** Kind of custom panel background asset. `image` covers static images + GIFs. */
export type PanelBgKind = "image" | "video";

export const PanelSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/, "Solo minúsculas, números y guiones");

/**
 * Optional panel identity overrides. An empty string clears the override.
 * `displayTitle` = heading shown inside the panel (falls back to the folder
 * name); `tabTitle` = browser tab text (falls back to displayTitle/title);
 * `faviconEmoji` = one emoji used as the tab icon.
 */
const DisplayTitleSchema = z.string().max(120).optional();
const TabTitleSchema = z.string().max(120).optional();
const FaviconEmojiSchema = z.string().max(16).optional();

export const CreatePanelBodySchema = z.object({
  title: z.string().trim().min(1).max(120),
  slug: PanelSlugSchema,
  folderId: z.string().uuid(),
  templateId: z.string().max(64).nullable().optional(),
  accessMode: PanelAccessModeSchema,
  password: z.string().min(1).max(200).optional(),
  userEmails: z.array(EmailSchema).max(500).optional(),
  displayTitle: DisplayTitleSchema,
  tabTitle: TabTitleSchema,
  faviconEmoji: FaviconEmojiSchema,
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
  displayTitle: DisplayTitleSchema,
  tabTitle: TabTitleSchema,
  faviconEmoji: FaviconEmojiSchema,
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
  displayTitle: string | null;
  tabTitle: string | null;
  faviconEmoji: string | null;
  /** Set when the panel has an uploaded custom background (image/gif/video). */
  bgAssetKind: PanelBgKind | null;
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
  /** Heading shown inside the panel (falls back to the folder name). */
  displayTitle?: string | null;
  /** Browser tab text and icon (emoji) overrides. */
  tabTitle?: string | null;
  faviconEmoji?: string | null;
  /**
   * Custom uploaded background. `bgAssetVersion` is a cache-busting token
   * (the panel's updatedAt); the asset is fetched from
   * `/public/panel/:slug/background`.
   */
  bgAssetKind?: PanelBgKind | null;
  bgAssetVersion?: string | null;
  /** Present only when unlocked/authorized. */
  root?: PanelFolder;
  needsPassword?: boolean;
  needsAuth?: boolean;
  forbidden?: boolean;
}
