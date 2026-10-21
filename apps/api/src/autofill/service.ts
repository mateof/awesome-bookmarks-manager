import {
  type AutofillRuntime,
  type AutofillVariable,
  AutofillVariableSchema,
  type AutofillVariableInfo,
  type Automation,
  type AutomationContent,
  type AutomationInput,
  type AutomationSummary,
  type CaptureFormBody,
  type CaptureFormResult,
  AutomationInputSchema,
  mergeCapturedSteps,
  stepsFromCapture,
  automationScope,
  automationVariableKeys,
} from "@awesome-bookmarks/shared";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { openField, sealField } from "../auth/encryption.js";
import type { AuthedContext } from "../auth/session.js";
import {
  bookmarkSnapshot,
  createBookmark,
  getBookmark,
  listBookmarks,
} from "../bookmarks/service.js";
import { normalizeUrl } from "../util/url.js";
import { getDb } from "../db/client.js";
import { autofillProfiles, bookmarkAutomations } from "../db/schema.js";
import { BadRequest, Conflict, NotFound } from "../util/errors.js";
import { recordVersion } from "../versions/service.js";
import {
  type StoredAutomation,
  deleteStored,
  fingerprint,
  readStored,
  writeStored,
} from "./store.js";

const PROFILE_AAD = "autofill.profile";

const StoredProfileSchema = z.object({
  variables: z.array(AutofillVariableSchema).default([]),
});


export function listVariables(ctx: AuthedContext): AutofillVariable[] {
  const row = getDb()
    .select()
    .from(autofillProfiles)
    .where(eq(autofillProfiles.userId, ctx.userId))
    .get();
  if (!row) return [];
  const raw = openField(ctx.dek, ctx.userId, PROFILE_AAD, Buffer.from(row.dataCt));
  return StoredProfileSchema.parse(JSON.parse(raw)).variables;
}

export function listVariableInfo(ctx: AuthedContext): AutofillVariableInfo[] {
  return listVariables(ctx).map(({ value, ...rest }) => ({
    ...rest,
    hasValue: value !== "",
  }));
}

export function saveVariables(
  ctx: AuthedContext,
  variables: AutofillVariable[],
): AutofillVariable[] {
  const dataCt = sealField(
    ctx.dek,
    ctx.userId,
    PROFILE_AAD,
    JSON.stringify({ variables }),
  );
  const updatedAt = new Date().toISOString();
  getDb()
    .insert(autofillProfiles)
    .values({ userId: ctx.userId, dataCt, updatedAt })
    .onConflictDoUpdate({
      target: autofillProfiles.userId,
      set: { dataCt, updatedAt },
    })
    .run();
  return listVariables(ctx);
}

function present(
  bookmarkId: string,
  url: string,
  stored: StoredAutomation,
  updatedAt: string,
  knownKeys: Set<string>,
): Automation {
  const current = fingerprint(stored.input, url);
  const status = stored.approved === current ? "approved" : "pending";
  return {
    bookmarkId,
    ...stored.input,
    status,
    fingerprint: current,
    unknownVariables: automationVariableKeys(stored.input).filter(
      (k) => !knownKeys.has(k),
    ),
    previousApproved: status === "pending" ? stored.approvedInput : null,
    updatedAt,
  };
}

function knownKeys(ctx: AuthedContext): Set<string> {
  return new Set(listVariables(ctx).map((v) => v.key));
}

function automatableUrl(ctx: AuthedContext, bookmarkId: string): string {
  const { url } = getBookmark(ctx, bookmarkId);
  if (!automationScope(url)) {
    throw BadRequest("Only http and https bookmarks can carry an automation");
  }
  return url;
}

export function getAutomation(
  ctx: AuthedContext,
  bookmarkId: string,
): Automation | null {
  const { url } = getBookmark(ctx, bookmarkId);
  const found = readStored(ctx, bookmarkId);
  if (!found) return null;
  return present(bookmarkId, url, found.stored, found.updatedAt, knownKeys(ctx));
}

function lastApproved(stored: StoredAutomation, url: string): AutomationContent | null {
  if (stored.approvedInput) return stored.approvedInput;
  return stored.approved === fingerprint(stored.input, url) ? stored.input : null;
}

function recordInHistory(ctx: AuthedContext, bookmarkId: string) {
  const bookmark = getBookmark(ctx, bookmarkId);
  recordVersion(ctx, "bookmark", bookmarkId, bookmark.rev, bookmarkSnapshot(ctx, bookmark));
}

export function setAutomation(
  ctx: AuthedContext,
  bookmarkId: string,
  input: AutomationInput,
  opts: { approve: boolean },
): Automation {
  const url = automatableUrl(ctx, bookmarkId);
  const previous = readStored(ctx, bookmarkId)?.stored ?? null;
  const next = fingerprint(input, url);
  writeStored(
    ctx,
    bookmarkId,
    opts.approve
      ? { input, approved: next, approvedInput: input }
      : {
          input,
          approved: previous?.approved ?? null,
          approvedInput: previous ? lastApproved(previous, url) : null,
        },
  );
  recordInHistory(ctx, bookmarkId);
  return getAutomation(ctx, bookmarkId)!;
}

export function approveAutomation(
  ctx: AuthedContext,
  bookmarkId: string,
  expected: string,
): Automation {
  const url = automatableUrl(ctx, bookmarkId);
  const found = readStored(ctx, bookmarkId);
  if (!found) throw NotFound("Automation not found");
  if (fingerprint(found.stored.input, url) !== expected) {
    throw Conflict("The automation changed since it was shown; review it again");
  }
  writeStored(ctx, bookmarkId, {
    input: found.stored.input,
    approved: expected,
    approvedInput: found.stored.input,
  });
  return getAutomation(ctx, bookmarkId)!;
}

export function deleteAutomation(ctx: AuthedContext, bookmarkId: string) {
  getBookmark(ctx, bookmarkId);
  if (!readStored(ctx, bookmarkId)) return;
  deleteStored(ctx, bookmarkId);
  recordInHistory(ctx, bookmarkId);
}

function allAutomations(ctx: AuthedContext): Array<{ automation: Automation; url: string }> {
  const rows = getDb()
    .select({ bookmarkId: bookmarkAutomations.bookmarkId })
    .from(bookmarkAutomations)
    .where(eq(bookmarkAutomations.userId, ctx.userId))
    .all();
  if (rows.length === 0) return [];
  const urls = new Map(listBookmarks(ctx, {}).map((b) => [b.id, b.url]));
  const keys = knownKeys(ctx);
  const out: Array<{ automation: Automation; url: string }> = [];
  for (const { bookmarkId } of rows) {
    const url = urls.get(bookmarkId);
    if (url === undefined) continue;
    try {
      const found = readStored(ctx, bookmarkId);
      if (found) {
        out.push({
          automation: present(bookmarkId, url, found.stored, found.updatedAt, keys),
          url,
        });
      }
    } catch (err) {
      console.warn(
        `[autofill] skip automation ${bookmarkId}: decode failed`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return out;
}

export function variableUsage(ctx: AuthedContext): Record<string, number> {
  const usage: Record<string, number> = {};
  for (const { automation } of allAutomations(ctx)) {
    for (const key of automationVariableKeys(automation)) {
      usage[key] = (usage[key] ?? 0) + 1;
    }
  }
  return usage;
}

export function listAutomationSummaries(ctx: AuthedContext): AutomationSummary[] {
  return allAutomations(ctx).map(({ automation: a, url }) => ({
    bookmarkId: a.bookmarkId,
    url,
    enabled: a.enabled,
    trigger: a.trigger,
    status: a.status,
    hasScript: a.script.trim() !== "",
  }));
}

export function autofillRuntime(ctx: AuthedContext): AutofillRuntime {
  const automations = allAutomations(ctx)
    .filter(({ automation: a, url }) =>
      a.enabled && a.status === "approved" && automationScope(url) !== null,
    )
    .map(({ automation: a, url }) => ({
      bookmarkId: a.bookmarkId,
      url,
      trigger: a.trigger,
      timeoutMs: a.timeoutMs,
      steps: a.steps,
      script: a.script,
    }));
  const variables = Object.fromEntries(
    listVariables(ctx).map((v) => [v.key, v.value]),
  );
  return { variables, automations };
}

function sameUrl(a: string, b: string): boolean {
  try {
    return normalizeUrl(a) === normalizeUrl(b);
  } catch {
    return false;
  }
}

export function captureIntoAutomation(
  ctx: AuthedContext,
  body: CaptureFormBody,
): CaptureFormResult {
  let bookmarkId = body.bookmarkId;
  let createdBookmark = false;
  if (bookmarkId) {
    getBookmark(ctx, bookmarkId);
  } else {
    bookmarkId = listBookmarks(ctx, {}).find((b) => sameUrl(b.url, body.url))?.id;
    if (!bookmarkId) {
      bookmarkId = createBookmark(ctx, {
        url: body.url,
        ...(body.title ? { title: body.title } : {}),
        folderId: body.folderId ?? null,
        fetchSnapshot: true,
      }).id;
      createdBookmark = true;
    }
  }
  const variables = Object.fromEntries(listVariables(ctx).map((v) => [v.key, v.value]));
  const captured = stepsFromCapture(body.fields, variables);
  const existing = readStored(ctx, bookmarkId)?.stored.input ?? null;
  const merged = mergeCapturedSteps(existing?.steps ?? [], captured);
  const result = {
    bookmarkId,
    createdBookmark,
    hadAutomation: existing !== null,
    added: merged.added,
    kept: merged.kept,
  };
  if (existing && merged.added === 0) return { ...result, steps: existing.steps };
  if (merged.steps.length > 50) {
    throw BadRequest("The automation would exceed 50 steps");
  }
  const saved = setAutomation(
    ctx,
    bookmarkId,
    AutomationInputSchema.parse({
      enabled: existing?.enabled ?? true,
      trigger: existing?.trigger ?? "open",
      timeoutMs: existing?.timeoutMs ?? 10000,
      steps: merged.steps,
      script: existing?.script ?? "",
    }),
    { approve: false },
  );
  return { ...result, steps: saved.steps };
}
