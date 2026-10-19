import { z } from "zod";

export const AUTOFILL_KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
export const AUTOFILL_TEMPLATE_PATTERN = /\{\{\s*([a-z][a-z0-9_]{0,39})\s*\}\}/g;

export const AutofillVariableSchema = z.object({
  id: z.string().uuid(),
  key: z.string().regex(AUTOFILL_KEY_PATTERN),
  label: z.string().trim().min(1).max(80),
  description: z.string().max(300).default(""),
  value: z.string().max(2000).default(""),
});
export type AutofillVariable = z.infer<typeof AutofillVariableSchema>;

export const AutofillVariableInfoSchema = AutofillVariableSchema.omit({
  value: true,
}).extend({ hasValue: z.boolean() });
export type AutofillVariableInfo = z.infer<typeof AutofillVariableInfoSchema>;

export const SaveAutofillVariablesBodySchema = z
  .object({ variables: z.array(AutofillVariableSchema).max(100) })
  .superRefine((body, ctx) => {
    const seen = new Set<string>();
    body.variables.forEach((v, i) => {
      if (seen.has(v.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["variables", i, "key"],
          message: `Duplicate key "${v.key}"`,
        });
      }
      seen.add(v.key);
    });
  });
export type SaveAutofillVariablesBody = z.infer<
  typeof SaveAutofillVariablesBodySchema
>;

const Selector = z.string().trim().min(1).max(500);
const Template = z.string().max(2000);

export const AutomationStepSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("fill"), selector: Selector, value: Template }),
  z.object({ action: z.literal("select"), selector: Selector, value: Template }),
  z.object({
    action: z.literal("check"),
    selector: Selector,
    checked: z.boolean().default(true),
  }),
  z.object({ action: z.literal("click"), selector: Selector }),
  z.object({ action: z.literal("wait"), selector: Selector }),
  z.object({
    action: z.literal("pause"),
    ms: z.number().int().min(0).max(30000),
  }),
]);
export type AutomationStep = z.infer<typeof AutomationStepSchema>;
export type AutomationAction = AutomationStep["action"];

export const AutomationTriggerSchema = z.enum(["open", "always"]);
export type AutomationTrigger = z.infer<typeof AutomationTriggerSchema>;

export const AutomationInputSchema = z
  .object({
    enabled: z.boolean().default(true),
    trigger: AutomationTriggerSchema.default("open"),
    timeoutMs: z.number().int().min(1000).max(60000).default(10000),
    steps: z.array(AutomationStepSchema).max(50).default([]),
    script: z.string().max(20000).default(""),
  })
  .refine((a) => a.steps.length > 0 || a.script.trim() !== "", {
    message: "An automation needs at least one step or a script",
    path: ["steps"],
  });
export type AutomationInput = z.infer<typeof AutomationInputSchema>;

export const AutomationStatusSchema = z.enum(["approved", "pending"]);
export type AutomationStatus = z.infer<typeof AutomationStatusSchema>;

export const AutomationSchema = z.object({
  bookmarkId: z.string().uuid(),
  enabled: z.boolean(),
  trigger: AutomationTriggerSchema,
  timeoutMs: z.number().int(),
  steps: z.array(AutomationStepSchema),
  script: z.string(),
  status: AutomationStatusSchema,
  fingerprint: z.string(),
  unknownVariables: z.array(z.string()),
  updatedAt: z.string(),
});
export type Automation = z.infer<typeof AutomationSchema>;

export const ApproveAutomationBodySchema = z.object({
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
});
export type ApproveAutomationBody = z.infer<typeof ApproveAutomationBodySchema>;

export const AutomationSummarySchema = z.object({
  bookmarkId: z.string().uuid(),
  url: z.string(),
  enabled: z.boolean(),
  trigger: AutomationTriggerSchema,
  status: AutomationStatusSchema,
  hasScript: z.boolean(),
});
export type AutomationSummary = z.infer<typeof AutomationSummarySchema>;

export const RunnableAutomationSchema = z.object({
  bookmarkId: z.string().uuid(),
  url: z.string(),
  trigger: AutomationTriggerSchema,
  timeoutMs: z.number().int(),
  steps: z.array(AutomationStepSchema),
  script: z.string(),
});
export type RunnableAutomation = z.infer<typeof RunnableAutomationSchema>;

export const AutofillRuntimeSchema = z.object({
  variables: z.record(z.string()),
  automations: z.array(RunnableAutomationSchema),
});
export type AutofillRuntime = z.infer<typeof AutofillRuntimeSchema>;

export function automationVariableKeys(
  a: Pick<AutomationInput, "steps" | "script">,
): string[] {
  const keys = new Set<string>();
  const scan = (text: string) => {
    for (const m of text.matchAll(AUTOFILL_TEMPLATE_PATTERN)) keys.add(m[1]!);
  };
  for (const step of a.steps) {
    if (step.action === "fill" || step.action === "select") scan(step.value);
  }
  for (const m of a.script.matchAll(/\bab\.vars\.([a-z][a-z0-9_]{0,39})\b/g)) {
    keys.add(m[1]!);
  }
  return [...keys].sort();
}

export function automationScope(url: string): { origin: string; path: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  return { origin: u.origin, path: u.pathname };
}

export function automationMatchesUrl(bookmarkUrl: string, pageUrl: string): boolean {
  const scope = automationScope(bookmarkUrl);
  const page = automationScope(pageUrl);
  if (!scope || !page || scope.origin !== page.origin) return false;
  const base = scope.path.endsWith("/") ? scope.path : `${scope.path}/`;
  return page.path === scope.path || page.path.startsWith(base);
}
