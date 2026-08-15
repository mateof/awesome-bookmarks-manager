import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CreatePanelBodySchema,
  CreateTemplateBodySchema,
  PANEL_SCENES,
  UpdatePanelBodySchema,
  UpdateTemplateBodySchema,
} from "@awesome-bookmarks/shared";
import { z } from "zod";
import type { AuthedContext } from "../auth/session.js";
import {
  createPanel,
  deletePanel,
  getPanel,
  listPanels,
  regeneratePanel,
  updatePanel,
} from "../panels/service.js";
import {
  DEFAULT_TEMPLATES,
  createTemplate,
  deleteTemplate,
  listTemplates,
  updateTemplate,
} from "../panels/templates.js";

function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

const BUILTIN_IDS = DEFAULT_TEMPLATES.map((t) => t.id).join(", ");

/**
 * Register the panel + panel-template MCP tools. A panel is a public,
 * template-styled view of a folder subtree; a template carries the look
 * (layout, colours, animated `scene`, and the optional `folderPreview`
 * sub-folder listing). All calls reuse the same domain services as the REST
 * API and run with the caller's authenticated context (userId + DEK).
 */
export function registerPanelTools(server: McpServer, ctx: AuthedContext) {
  /* ---- Panels ---------------------------------------------------------- */

  server.tool(
    "list_panels",
    "List the caller's panels (id, slug, title, template, access, public url, background overrides).",
    {},
    async () => ok(listPanels(ctx)),
  );

  server.tool(
    "get_panel",
    "Get one panel by id, including its allowed-user emails.",
    { id: z.string().uuid() },
    async (args) => ok(getPanel(ctx, args.id)),
  );

  server.tool(
    "create_panel",
    `Create a public panel for a folder subtree. 'slug' is the public URL path (a-z, 0-9, dashes). 'folderId' is the source folder. 'templateId' selects the look: a built-in (${BUILTIN_IDS}) or a user template id from list_panel_templates; omit for the default. 'accessMode' is public | password | users (password requires 'password'; users requires 'userEmails'). 'displayTitle', 'tabTitle' and 'faviconEmoji' are optional per-panel overrides for the heading, browser-tab title and tab icon.`,
    CreatePanelBodySchema.shape,
    async (args) => ok(await createPanel(ctx, args)),
  );

  server.tool(
    "update_panel",
    "Update a panel by id. Any omitted field is left unchanged; an empty string clears an override (displayTitle/tabTitle/faviconEmoji). Change 'templateId' to restyle it.",
    { id: z.string().uuid(), ...UpdatePanelBodySchema.shape },
    async (args) => {
      const { id, ...body } = args;
      return ok(await updatePanel(ctx, id, body));
    },
  );

  server.tool(
    "regenerate_panel",
    "Re-snapshot a panel's source folder so the public view reflects the latest bookmarks/folders.",
    { id: z.string().uuid() },
    async (args) => ok(regeneratePanel(ctx, args.id)),
  );

  server.tool(
    "delete_panel",
    "Delete a panel by id.",
    { id: z.string().uuid() },
    async (args) => {
      deletePanel(ctx, args.id);
      return ok({ ok: true });
    },
  );

  /* ---- Templates ------------------------------------------------------- */

  server.tool(
    "list_panel_templates",
    "List panel templates: the built-ins plus the caller's own. Each has an id, name and full config (layout, theme colours, card options, optional animated 'scene' and 'folderPreview').",
    {},
    async () => ok(listTemplates(ctx)),
  );

  server.tool(
    "create_panel_template",
    "Create a reusable panel template. 'config' holds the full look: layout (grid|list|bento|terminal|dashboard), theme colours, card toggles, and optionally 'scene' (see list_panel_scenes) and 'folderPreview' (list each folder's subfolders beneath it).",
    CreateTemplateBodySchema.shape,
    async (args) => ok(createTemplate(ctx, args)),
  );

  server.tool(
    "update_panel_template",
    "Update one of the caller's own templates by id (built-in ids starting with 'builtin:' cannot be edited).",
    { id: z.string().max(64), ...UpdateTemplateBodySchema.shape },
    async (args) => {
      const { id, ...body } = args;
      return ok(updateTemplate(ctx, id, body));
    },
  );

  server.tool(
    "delete_panel_template",
    "Delete one of the caller's own templates by id (built-ins cannot be deleted).",
    { id: z.string().max(64) },
    async (args) => {
      deleteTemplate(ctx, args.id);
      return ok({ ok: true });
    },
  );

  server.tool(
    "list_panel_scenes",
    "List the built-in decorative background scenes usable as a template's 'scene' value (animated backgrounds like galaxy, ocean, fishtank, etc.).",
    {},
    async () => ok(PANEL_SCENES),
  );
}
