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
      tagFilter: true,
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
      tagFilter: true,
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
      tagFilter: false,
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
      tagFilter: true,
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
        showTags: true,
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
      tagFilter: true,
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
        showTags: true,
      },
      header: "banner",
    },
  },
  {
    id: "builtin:galaxy",
    name: "Galaxia",
    config: {
      layout: "grid",
      tagFilter: true,
      columns: 4,
      scene: "galaxy",
      theme: {
        bg: "#0b1026",
        surface: "rgba(22,28,54,0.72)",
        text: "#e6e8ff",
        muted: "#9aa2d6",
        accent: "#a78bfa",
        border: "rgba(150,160,255,0.22)",
      },
      card: {
        radius: "1rem",
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
    id: "builtin:ocean",
    name: "Océano",
    config: {
      layout: "grid",
      tagFilter: true,
      columns: 4,
      scene: "ocean",
      theme: {
        bg: "linear-gradient(180deg,#8ec5fc 0%,#0b4a7a 100%)",
        surface: "rgba(255,255,255,0.86)",
        text: "#06283d",
        muted: "#2c6f97",
        accent: "#0288d1",
        border: "rgba(255,255,255,0.5)",
      },
      card: {
        radius: "0.9rem",
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
    id: "builtin:beach",
    name: "Playa",
    config: {
      layout: "grid",
      tagFilter: true,
      columns: 4,
      scene: "beach",
      theme: {
        bg: "linear-gradient(180deg,#aee1ff 0%,#ffe6a7 100%)",
        surface: "rgba(255,255,255,0.9)",
        text: "#5b3a1a",
        muted: "#a9743f",
        accent: "#f08a24",
        border: "rgba(180,140,80,0.3)",
      },
      card: {
        radius: "0.9rem",
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
    id: "builtin:aquarium",
    name: "Pecera",
    config: {
      layout: "grid",
      tagFilter: true,
      columns: 4,
      scene: "fishtank",
      theme: {
        bg: "linear-gradient(180deg,#0e7490 0%,#155e75 100%)",
        surface: "rgba(255,255,255,0.85)",
        text: "#053345",
        muted: "#2b7a8f",
        accent: "#06b6d4",
        border: "rgba(255,255,255,0.4)",
      },
      card: {
        radius: "1rem",
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
    id: "builtin:dragonball",
    name: "Dragon Ball",
    config: {
      layout: "grid",
      tagFilter: true,
      columns: 4,
      scene: "dragonballs",
      folderPreview: true,
      theme: {
        bg: "linear-gradient(160deg,#ffb347 0%,#ff7b00 55%,#e64a19 100%)",
        surface: "rgba(255,255,255,0.92)",
        text: "#152a6b",
        muted: "#5566b0",
        accent: "#ff6d00",
        border: "rgba(255,109,0,0.35)",
      },
      card: {
        radius: "1rem",
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
    id: "builtin:doraemon",
    name: "Doraemon",
    config: {
      layout: "grid",
      tagFilter: true,
      columns: 4,
      scene: "clouds",
      folderPreview: true,
      theme: {
        bg: "linear-gradient(180deg,#48b1ee 0%,#8fd3ff 100%)",
        surface: "#ffffff",
        text: "#0b3d61",
        muted: "#4a7ba6",
        accent: "#e60012",
        border: "#bce3ff",
      },
      card: {
        radius: "1.1rem",
        shadow: true,
        showIcon: true,
        showDescription: false,
        showUrl: false,
        showTags: true,
      },
      header: "banner",
    },
  },
  /* --- Tree layouts: the panel draws the whole hierarchy and opens it as
     you move through it, instead of navigating folder by folder. --- */
  {
    id: "builtin:tree",
    name: "Árbol",
    config: {
      layout: "tree",
      tagFilter: true,
      showBreadcrumb: false,
      maxWidth: 820,
      theme: {
        bg: "linear-gradient(180deg,#0f1720 0%,#131c26 100%)",
        surface: "rgba(255,255,255,0.04)",
        text: "#e8eef5",
        muted: "#8ba0b4",
        accent: "#4ade80",
        border: "rgba(255,255,255,0.12)",
      },
      card: {
        radius: "0.6rem",
        shadow: false,
        showIcon: true,
        showDescription: false,
        showUrl: false,
        showTags: false,
      },
      header: "minimal",
    },
  },
  {
    id: "builtin:blueprint",
    name: "Plano",
    config: {
      layout: "tree",
      tagFilter: false,
      showBreadcrumb: false,
      maxWidth: 860,
      font: "ui-monospace,SFMono-Regular,Menlo,monospace",
      theme: {
        bg: "#0b3a63",
        surface: "rgba(255,255,255,0.06)",
        text: "#dbeafe",
        muted: "#93b4d8",
        accent: "#7dd3fc",
        border: "rgba(190,220,255,0.28)",
      },
      card: {
        radius: "0.25rem",
        shadow: false,
        showIcon: false,
        showDescription: false,
        showUrl: false,
        showTags: false,
      },
      header: "minimal",
    },
  },
  {
    id: "builtin:mindmap",
    name: "Mapa mental",
    config: {
      layout: "mindmap",
      tagFilter: true,
      showBreadcrumb: false,
      maxWidth: 1600,
      theme: {
        bg: "radial-gradient(900px 500px at 20% 0%,#fef3c7 0%,#fffbeb 60%)",
        surface: "#ffffff",
        text: "#422006",
        muted: "#a16207",
        accent: "#ea580c",
        border: "#fde68a",
      },
      card: {
        radius: "0.7rem",
        shadow: true,
        showIcon: true,
        showDescription: false,
        showUrl: false,
        showTags: false,
      },
      header: "banner",
    },
  },
  {
    id: "builtin:synapse",
    name: "Sinapsis",
    config: {
      layout: "mindmap",
      tagFilter: false,
      showBreadcrumb: false,
      maxWidth: 1600,
      theme: {
        bg: "linear-gradient(160deg,#0a0118 0%,#1a0b2e 60%,#0a0118 100%)",
        surface: "rgba(129,74,200,0.16)",
        text: "#f3e8ff",
        muted: "#b39ddb",
        accent: "#e879f9",
        border: "rgba(232,121,249,0.35)",
      },
      card: {
        radius: "1rem",
        shadow: true,
        showIcon: true,
        showDescription: false,
        showUrl: false,
        showTags: false,
      },
      header: "minimal",
    },
  },
  {
    id: "builtin:orbit",
    name: "Órbita",
    config: {
      layout: "orbit",
      tagFilter: false,
      showBreadcrumb: false,
      showSectionTitles: false,
      maxWidth: 900,
      scene: "galaxy",
      theme: {
        bg: "radial-gradient(1000px 700px at 50% 30%,#131a3a 0%,#05060f 70%)",
        surface: "rgba(20,28,60,0.85)",
        text: "#e6ecff",
        muted: "#8b9ac9",
        accent: "#60a5fa",
        border: "rgba(120,150,255,0.3)",
      },
      card: {
        radius: "0.8rem",
        shadow: true,
        showIcon: true,
        showDescription: false,
        showUrl: false,
        showTags: false,
      },
      header: "minimal",
    },
  },
  {
    id: "builtin:reactor",
    name: "Reactor",
    config: {
      layout: "orbit",
      tagFilter: false,
      showBreadcrumb: false,
      showSectionTitles: false,
      maxWidth: 900,
      font: "ui-monospace,SFMono-Regular,Menlo,monospace",
      theme: {
        bg: "radial-gradient(800px 600px at 50% 40%,#2b0a0a 0%,#0a0505 70%)",
        surface: "rgba(60,12,12,0.85)",
        text: "#ffe4e0",
        muted: "#d08a80",
        accent: "#fb923c",
        border: "rgba(251,146,60,0.4)",
      },
      card: {
        radius: "0.5rem",
        shadow: true,
        showIcon: false,
        showDescription: false,
        showUrl: false,
        showTags: false,
      },
      header: "minimal",
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
