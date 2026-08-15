import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * The MCP endpoint exposes panel + template management, so an AI client can
 * create/modify panels and themes. We mint an API token (carrying the wrapped
 * DEK for headless access) and drive tools/call over the Streamable HTTP
 * transport, then assert the side effects via the authenticated REST API.
 */
const user = {
  email: "mcp.panels.e2e@example.com",
  nickname: "mcppanelsuser",
  password: "ModelContextProto2024",
};

const CONFIG = {
  layout: "grid",
  theme: {
    bg: "#0b1026",
    surface: "#1e293b",
    text: "#e2e8f0",
    muted: "#94a3b8",
    accent: "#38bdf8",
    border: "#334155",
  },
  card: {
    radius: "0.75rem",
    shadow: true,
    showIcon: true,
    showDescription: false,
    showUrl: false,
    showTags: true,
  },
  scene: "ocean",
  folderPreview: true,
};

test("MCP: crear panel y plantilla vía tools/call", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  // Mint an API token (wrapped DEK enables headless decryption).
  const token = (
    await (await req.post("/api/extension/tokens", { data: { label: "mcp-e2e" } })).json()
  ).token as string;
  expect(token).toBeTruthy();

  const folder = await (
    await req.post("/api/folders", { data: { name: "McpRoot" } })
  ).json();

  // One self-contained batch per call: initialize + initialized + the tool call
  // against a single stateless server instance.
  const mcpCall = (name: string, args: unknown) =>
    req.post("/api/mcp", {
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      data: { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } },
    });

  // Create a panel through MCP.
  const r1 = await mcpCall("create_panel", {
    title: "McpPanel",
    slug: "mcppanel",
    folderId: folder.id,
    accessMode: "public",
    templateId: "builtin:galaxy",
    displayTitle: "Panel por IA",
  });
  expect(r1.ok(), await r1.text()).toBeTruthy();

  const panels = await (await req.get("/api/panels")).json();
  const created = panels.find((p: { slug: string }) => p.slug === "mcppanel");
  expect(created, "MCP create_panel should have created the panel").toBeTruthy();
  expect(created.displayTitle).toBe("Panel por IA");
  expect(created.templateId).toBe("builtin:galaxy");

  // Create a template (with an animated scene + folderPreview) through MCP.
  const r2 = await mcpCall("create_panel_template", { name: "McpTpl", config: CONFIG });
  expect(r2.ok(), await r2.text()).toBeTruthy();

  const templates = await (await req.get("/api/panel-templates")).json();
  const tpl = templates.find((t: { name: string }) => t.name === "McpTpl");
  expect(tpl, "MCP create_panel_template should have created the template").toBeTruthy();
  expect(tpl.config.scene).toBe("ocean");
  expect(tpl.config.folderPreview).toBe(true);
});
