import {
  type CreateTemplateBody,
  type TemplateConfig,
  TemplateConfigSchema,
  type TemplateItem,
  type UpdateTemplateBody,
} from "@awesome-bookmarks/shared";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { AuthedContext } from "../auth/session.js";
import { getDb } from "../db/client.js";
import { panelTemplates } from "../db/schema.js";
import { BadRequest, NotFound } from "../util/errors.js";

/** Built-in templates. Distinct shapes; used as-is or duplicated by users. */
export const DEFAULT_TEMPLATES: { id: string; name: string; config: TemplateConfig }[] = [
  {
    id: "builtin:grid",
    name: "Cuadrícula",
    config: {
      layout: "grid",
      columns: 4,
      theme: {
        bg: "linear-gradient(160deg,#f8fafc 0%,#eef2ff 100%)",
        surface: "#ffffff",
        text: "#0f172a",
        muted: "#64748b",
        accent: "#2563eb",
        border: "#e2e8f0",
      },
      card: {
        radius: "0.85rem",
        shadow: true,
        showIcon: true,
        showDescription: false,
        showUrl: false,
        showTags: true,
      },
      header: "banner",
    },
  },
  {
    id: "builtin:bento",
    name: "Bento",
    config: {
      layout: "bento",
      theme: {
        bg: "radial-gradient(1200px 600px at 10% -10%,#1e293b 0%,#0b1020 55%)",
        surface: "rgba(19,26,46,0.85)",
        text: "#e5e7eb",
        muted: "#94a3b8",
        accent: "#a78bfa",
        border: "#26304d",
      },
      card: {
        radius: "1rem",
        shadow: true,
        showIcon: true,
        showDescription: true,
        showUrl: false,
        showTags: true,
      },
      header: "banner",
    },
  },
  {
    id: "builtin:terminal",
    name: "Terminal",
    config: {
      layout: "terminal",
      theme: {
        bg: "#05060a",
        surface: "#080d0a",
        text: "#b9f6ca",
        muted: "#4b7a5a",
        accent: "#22c55e",
        border: "#123a1e",
      },
      card: {
        radius: "0.25rem",
        shadow: false,
        showIcon: false,
        showDescription: true,
        showUrl: true,
        showTags: false,
      },
      font: "'JetBrains Mono','Fira Code',ui-monospace,SFMono-Regular,Menlo,monospace",
      header: "minimal",
    },
  },
  {
    id: "builtin:minimal",
    name: "Lista minimal",
    config: {
      layout: "list",
      theme: {
        bg: "#ffffff",
        surface: "#ffffff",
        text: "#111827",
        muted: "#6b7280",
        accent: "#111827",
        border: "#e5e7eb",
      },
      card: {
        radius: "0",
        shadow: false,
        showIcon: true,
        showDescription: true,
        showUrl: true,
        showTags: false,
      },
      font: "'Inter',ui-sans-serif,system-ui,sans-serif",
      header: "minimal",
    },
  },
  {
    id: "builtin:dashboard",
    name: "Dashboard",
    config: {
      layout: "dashboard",
      columns: 3,
      theme: {
        bg: "linear-gradient(135deg,#4f46e5 0%,#7c3aed 50%,#db2777 100%)",
        surface: "rgba(255,255,255,0.12)",
        text: "#ffffff",
        muted: "rgba(255,255,255,0.7)",
        accent: "#fbbf24",
        border: "rgba(255,255,255,0.18)",
      },
      card: {
        radius: "0.9rem",
        shadow: true,
        showIcon: true,
        showDescription: false,
        showUrl: false,
        showTags: false,
      },
      header: "banner",
    },
  },
];

const DEFAULT_BY_ID = new Map(DEFAULT_TEMPLATES.map((t) => [t.id, t]));

/** Resolve a template id (built-in or user) to a concrete config. */
export function resolveTemplateConfig(
  templateId: string | null | undefined,
  ownerId: string,
): TemplateConfig {
  if (!templateId) return DEFAULT_TEMPLATES[0]!.config;
  const builtin = DEFAULT_BY_ID.get(templateId);
  if (builtin) return builtin.config;
  const row = getDb()
    .select({ config: panelTemplates.config, userId: panelTemplates.userId })
    .from(panelTemplates)
    .where(eq(panelTemplates.id, templateId))
    .get();
  if (row && row.userId === ownerId) {
    const parsed = TemplateConfigSchema.safeParse(JSON.parse(row.config));
    if (parsed.success) return parsed.data;
  }
  return DEFAULT_TEMPLATES[0]!.config;
}

export function listTemplates(ctx: AuthedContext): TemplateItem[] {
  const builtins: TemplateItem[] = DEFAULT_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    config: t.config,
    builtin: true,
  }));
  const mine = getDb()
    .select()
    .from(panelTemplates)
    .where(eq(panelTemplates.userId, ctx.userId))
    .all()
    .map((r): TemplateItem => ({
      id: r.id,
      name: r.name,
      config: TemplateConfigSchema.parse(JSON.parse(r.config)),
      builtin: false,
      createdAt: r.createdAt,
    }));
  return [...builtins, ...mine];
}

export function createTemplate(
  ctx: AuthedContext,
  input: CreateTemplateBody,
): TemplateItem {
  const id = uuidv4();
  getDb()
    .insert(panelTemplates)
    .values({
      id,
      userId: ctx.userId,
      name: input.name,
      config: JSON.stringify(input.config),
    })
    .run();
  return { id, name: input.name, config: input.config, builtin: false };
}

export function updateTemplate(
  ctx: AuthedContext,
  id: string,
  input: UpdateTemplateBody,
): TemplateItem {
  if (id.startsWith("builtin:")) throw BadRequest("No se puede editar una plantilla por defecto");
  const row = getDb()
    .select()
    .from(panelTemplates)
    .where(eq(panelTemplates.id, id))
    .get();
  if (!row || row.userId !== ctx.userId) throw NotFound("Template not found");
  const config = input.config ?? TemplateConfigSchema.parse(JSON.parse(row.config));
  const name = input.name ?? row.name;
  getDb()
    .update(panelTemplates)
    .set({
      name,
      config: JSON.stringify(config),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(panelTemplates.id, id))
    .run();
  return { id, name, config, builtin: false, createdAt: row.createdAt };
}

export function deleteTemplate(ctx: AuthedContext, id: string) {
  if (id.startsWith("builtin:")) throw BadRequest("No se puede eliminar una plantilla por defecto");
  const row = getDb()
    .select({ userId: panelTemplates.userId })
    .from(panelTemplates)
    .where(eq(panelTemplates.id, id))
    .get();
  if (!row || row.userId !== ctx.userId) throw NotFound("Template not found");
  getDb().delete(panelTemplates).where(eq(panelTemplates.id, id)).run();
}
