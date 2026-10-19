import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  AutomationInputSchema,
  AutomationStepSchema,
  AutomationTriggerSchema,
} from "@awesome-bookmarks/shared";
import { z } from "zod";
import type { AuthedContext } from "../auth/session.js";
import {
  deleteAutomation,
  getAutomation,
  listVariableInfo,
  setAutomation,
} from "../autofill/service.js";

function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function registerAutofillTools(server: McpServer, ctx: AuthedContext) {
  server.tool(
    "list_autofill_variables",
    "List the user's autofill variables (key, label, description, hasValue). Values are never returned. Reference a variable inside an automation step as {{key}}.",
    {},
    async () => ok(listVariableInfo(ctx)),
  );

  server.tool(
    "get_bookmark_automation",
    "Get the autofill automation attached to a bookmark, or null. `status` is 'pending' until the user approves it in the web app; pending automations never run.",
    { bookmarkId: z.string().uuid() },
    async ({ bookmarkId }) => ok({ automation: getAutomation(ctx, bookmarkId) }),
  );

  server.tool(
    "set_bookmark_automation",
    "Create or replace the automation that fills a form when the bookmark is opened. Steps run in order; fill/select/check/click/wait take a CSS selector and wait for it to appear. Use {{key}} in `value` to insert an autofill variable (see list_autofill_variables). `script` is optional JavaScript that receives `ab.vars`. Whatever is saved here stays 'pending' and does not run until the user reviews and approves it in the web app.",
    {
      bookmarkId: z.string().uuid(),
      steps: z.array(AutomationStepSchema).max(50).default([]),
      script: z.string().max(20000).default(""),
      trigger: AutomationTriggerSchema.default("open").describe(
        "'open' runs when the bookmark is opened from AwesomeBookmarks; 'always' runs on every visit to that address.",
      ),
      enabled: z.boolean().default(true),
      timeoutMs: z.number().int().min(1000).max(60000).default(10000),
    },
    async ({ bookmarkId, ...rest }) =>
      ok(
        setAutomation(ctx, bookmarkId, AutomationInputSchema.parse(rest), {
          approve: false,
        }),
      ),
  );

  server.tool(
    "delete_bookmark_automation",
    "Remove the automation attached to a bookmark.",
    { bookmarkId: z.string().uuid() },
    async ({ bookmarkId }) => {
      deleteAutomation(ctx, bookmarkId);
      return ok({ ok: true });
    },
  );
}
