import { hashPassword, verifyPassword } from "@awesome-bookmarks/crypto";
import type {
  CreatePanelBody,
  PanelFaviconKind,
  PanelBookmark,
  PanelDetail,
  PanelFolder,
  PanelListItem,
  PublicPanelResponse,
  UpdatePanelBody,
} from "@awesome-bookmarks/shared";
import { and, eq, isNull } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { masterUnwrap, masterWrap, openField } from "../auth/encryption.js";
import { flattenDatabases } from "../databases/flatten.js";
import type { AuthedContext } from "../auth/session.js";
import { getDb } from "../db/client.js";
import {
  bookmarkTags,
  bookmarks,
  folders,
  panelAllowedUsers,
  panels,
  tags,
  users,
} from "../db/schema.js";
import { getEnv } from "../env.js";
import { deleteBlob } from "../storage/blobs.js";
import { panelBgKind } from "../storage/panel-assets.js";
import { BadRequest, Conflict, NotFound, Unauthorized } from "../util/errors.js";
import { resolveTemplateConfig } from "./templates.js";

function panelUrl(slug: string): string {
  return `${getEnv().PUBLIC_BASE_URL.replace(/\/$/, "")}/panel/${slug}`;
}

/** Which kind of tab icon a panel row carries, if any. */
function faviconKindOf(row: {
  faviconBlobPath: string | null;
  faviconEmoji: string | null;
}): PanelFaviconKind | null {
  if (row.faviconBlobPath) return "image";
  if (row.faviconEmoji) return "emoji";
  return null;
}

/** Trim an optional override; an empty string clears it (stored as null). */
function normOverride(v: string | null | undefined): string | null {
  if (v == null) return null;
  const trimmed = v.trim();
  return trimmed ? trimmed : null;
}

function bookmarkTagList(bookmarkId: string): { name: string; color: string }[] {
  return getDb()
    .select({ name: tags.name, color: tags.color })
    .from(bookmarkTags)
    .innerJoin(tags, eq(tags.id, bookmarkTags.tagId))
    .where(eq(bookmarkTags.bookmarkId, bookmarkId))
    .all();
}

function buildBookmark(
  userId: string,
  dek: Buffer,
  row: typeof bookmarks.$inferSelect,
): PanelBookmark {
  if (row.aliasOf) {
    const target = getDb()
      .select()
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.id, row.aliasOf),
          eq(bookmarks.userId, userId),
          isNull(bookmarks.deletedAt),
        ),
      )
      .get();
    if (target) row = target;
  }
  return {
    id: row.id,
    title: openField(dek, userId, "bookmark.title", Buffer.from(row.titleCt)),
    url: openField(dek, userId, "bookmark.url", Buffer.from(row.urlCt)),
    // Flattened: a published panel is a materialised copy read without a
    // session, so a live database block would render as an empty box.
    description: row.descriptionCt
      ? flattenDatabases(
          { userId, dek },
          openField(dek, userId, "bookmark.description", Buffer.from(row.descriptionCt)),
        )
      : null,
    tags: bookmarkTagList(row.id),
  };
}

function buildFolder(
  userId: string,
  dek: Buffer,
  folderId: string,
  /** Guards against a symlink cycle while materialising the tree. */
  visiting: Set<string> = new Set(),
): PanelFolder {
  let row = getDb()
    .select()
    .from(folders)
    .where(
      and(
        eq(folders.id, folderId),
        eq(folders.userId, userId),
        isNull(folders.deletedAt),
      ),
    )
    .get();
  if (!row) throw NotFound("Folder not found");
  // A symlink contributes the *target's* live content, which is what makes a
  // panel built from linked folders stay up to date with the originals.
  if (row.aliasOf) {
    if (visiting.has(row.aliasOf)) {
      return { id: row.id, name: "", description: null, bookmarks: [], subfolders: [] };
    }
    const target = getDb()
      .select()
      .from(folders)
      .where(
        and(
          eq(folders.id, row.aliasOf),
          eq(folders.userId, userId),
          isNull(folders.deletedAt),
        ),
      )
      .get();
    if (!target) {
      return { id: row.id, name: "", description: null, bookmarks: [], subfolders: [] };
    }
    visiting.add(row.aliasOf);
    row = target;
  }
  const childFolders = getDb()
    .select({ id: folders.id })
    .from(folders)
    .where(
      and(
        eq(folders.parentId, row.id),
        eq(folders.userId, userId),
        isNull(folders.deletedAt),
      ),
    )
    .all();
  const childBookmarks = getDb()
    .select()
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.folderId, row.id),
        eq(bookmarks.userId, userId),
        isNull(bookmarks.deletedAt),
      ),
    )
    .all();
  return {
    id: row.id,
    name: openField(dek, userId, "folder.name", Buffer.from(row.nameCt)),
    // Flattened: a published panel is a materialised copy read without a
    // session, so a live database block would render as an empty box.
    description: row.descriptionCt
      ? flattenDatabases(
          { userId, dek },
          openField(dek, userId, "folder.description", Buffer.from(row.descriptionCt)),
        )
      : null,
    bookmarks: childBookmarks.map((b) => buildBookmark(userId, dek, b)),
    subfolders: childFolders.map((f) => buildFolder(userId, dek, f.id, new Set(visiting))),
  };
}

/**
 * Rebuild one panel's snapshot from the owner's live tree. Used by the
 * background job that keeps panels current when their content changes.
 */
export function rebuildPanelPayload(userId: string, dek: Buffer, panelId: string) {
  const row = getDb().select().from(panels).where(eq(panels.id, panelId)).get();
  if (!row) throw new Error("Panel not found");
  if (row.userId !== userId) throw new Error("Job user does not match panel owner");
  const tree = buildFolder(userId, dek, row.folderId);
  const sealed = masterWrap(userId, Buffer.from(JSON.stringify(tree), "utf8"));
  getDb()
    .update(panels)
    .set({ payloadCt: sealed, payloadStatus: "ready", updatedAt: new Date().toISOString() })
    .where(eq(panels.id, panelId))
    .run();
}

/** Decrypt the folder subtree and seal it with the master key. */
function materialize(ctx: AuthedContext, panelId: string, folderId: string) {
  const tree = buildFolder(ctx.userId, ctx.dek, folderId);
  const sealed = masterWrap(ctx.userId, Buffer.from(JSON.stringify(tree), "utf8"));
  getDb()
    .update(panels)
    .set({ payloadCt: sealed, payloadStatus: "ready", updatedAt: new Date().toISOString() })
    .where(eq(panels.id, panelId))
    .run();
}

function slugTaken(slug: string, exceptId?: string): boolean {
  const row = getDb()
    .select({ id: panels.id })
    .from(panels)
    .where(eq(panels.slug, slug))
    .get();
  return !!row && row.id !== exceptId;
}

function setAllowedByEmail(panelId: string, emails: string[]) {
  getDb().delete(panelAllowedUsers).where(eq(panelAllowedUsers.panelId, panelId)).run();
  const seen = new Set<string>();
  for (const email of emails) {
    const u = getDb()
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.trim().toLowerCase()))
      .get();
    if (u && !seen.has(u.id)) {
      seen.add(u.id);
      getDb().insert(panelAllowedUsers).values({ panelId, userId: u.id }).run();
    }
  }
}

function allowedUserIds(panelId: string): string[] {
  return getDb()
    .select({ userId: panelAllowedUsers.userId })
    .from(panelAllowedUsers)
    .where(eq(panelAllowedUsers.panelId, panelId))
    .all()
    .map((r) => r.userId);
}

function allowedUserEmails(panelId: string): string[] {
  return getDb()
    .select({ email: users.email })
    .from(panelAllowedUsers)
    .innerJoin(users, eq(users.id, panelAllowedUsers.userId))
    .where(eq(panelAllowedUsers.panelId, panelId))
    .all()
    .map((r) => r.email);
}

function toListItem(row: typeof panels.$inferSelect): PanelListItem {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    folderId: row.folderId,
    templateId: row.templateId,
    accessMode: row.accessMode as PanelListItem["accessMode"],
    hasPassword: !!row.passwordHash,
    userCount: row.accessMode === "users" ? allowedUserIds(row.id).length : 0,
    status: row.payloadStatus,
    url: panelUrl(row.slug),
    displayTitle: row.displayTitle ?? null,
    tabTitle: row.tabTitle ?? null,
    faviconEmoji: row.faviconEmoji ?? null,
    bgAssetKind: panelBgKind(row.bgMime),
    faviconKind: faviconKindOf(row),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createPanel(
  ctx: AuthedContext,
  input: CreatePanelBody,
): Promise<PanelDetail> {
  if (slugTaken(input.slug)) throw Conflict("Ese nombre de panel ya existe");
  if (input.accessMode === "password" && !input.password) {
    throw BadRequest("Falta la contraseña del panel");
  }
  const id = uuidv4();
  const passwordHash =
    input.accessMode === "password" && input.password
      ? await hashPassword(input.password)
      : null;
  getDb()
    .insert(panels)
    .values({
      id,
      userId: ctx.userId,
      slug: input.slug,
      title: input.title,
      displayTitle: normOverride(input.displayTitle),
      tabTitle: normOverride(input.tabTitle),
      faviconEmoji: normOverride(input.faviconEmoji),
      folderId: input.folderId,
      templateId: input.templateId ?? null,
      accessMode: input.accessMode,
      passwordHash,
      payloadStatus: "pending",
    })
    .run();
  if (input.accessMode === "users") setAllowedByEmail(id, input.userEmails ?? []);
  materialize(ctx, id, input.folderId);
  return getPanel(ctx, id);
}

export function listPanels(ctx: AuthedContext): PanelListItem[] {
  return getDb()
    .select()
    .from(panels)
    .where(eq(panels.userId, ctx.userId))
    .all()
    .map(toListItem);
}

export function getPanel(ctx: AuthedContext, id: string): PanelDetail {
  const row = getDb()
    .select()
    .from(panels)
    .where(and(eq(panels.id, id), eq(panels.userId, ctx.userId)))
    .get();
  if (!row) throw NotFound("Panel not found");
  return { ...toListItem(row), userEmails: allowedUserEmails(row.id) };
}

export async function updatePanel(
  ctx: AuthedContext,
  id: string,
  input: UpdatePanelBody,
): Promise<PanelDetail> {
  const row = getDb()
    .select()
    .from(panels)
    .where(and(eq(panels.id, id), eq(panels.userId, ctx.userId)))
    .get();
  if (!row) throw NotFound("Panel not found");
  if (input.slug && input.slug !== row.slug && slugTaken(input.slug, id)) {
    throw Conflict("Ese nombre de panel ya existe");
  }
  const accessMode = input.accessMode ?? row.accessMode;
  let passwordHash = row.passwordHash;
  if (input.password !== undefined) {
    passwordHash = input.password ? await hashPassword(input.password) : null;
  }
  if (accessMode !== "password") passwordHash = null;
  if (accessMode === "password" && !passwordHash) {
    throw BadRequest("Falta la contraseña del panel");
  }
  getDb()
    .update(panels)
    .set({
      title: input.title ?? row.title,
      slug: input.slug ?? row.slug,
      displayTitle:
        input.displayTitle === undefined ? row.displayTitle : normOverride(input.displayTitle),
      tabTitle: input.tabTitle === undefined ? row.tabTitle : normOverride(input.tabTitle),
      faviconEmoji:
        input.faviconEmoji === undefined ? row.faviconEmoji : normOverride(input.faviconEmoji),
      // Emoji and uploaded image are alternatives: choosing an emoji drops the
      // image, the same way the background colour and image exclude each other.
      ...(input.faviconEmoji !== undefined && normOverride(input.faviconEmoji)
        ? { faviconBlobPath: null, faviconMime: null }
        : {}),
      templateId: input.templateId === undefined ? row.templateId : input.templateId,
      accessMode,
      passwordHash,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(panels.id, id))
    .run();
  if (accessMode === "users") {
    if (input.userEmails !== undefined) setAllowedByEmail(id, input.userEmails);
  } else {
    getDb().delete(panelAllowedUsers).where(eq(panelAllowedUsers.panelId, id)).run();
  }
  return getPanel(ctx, id);
}

export function deletePanel(ctx: AuthedContext, id: string) {
  const row = getDb()
    .select({ id: panels.id })
    .from(panels)
    .where(and(eq(panels.id, id), eq(panels.userId, ctx.userId)))
    .get();
  if (!row) throw NotFound("Panel not found");
  getDb().delete(panels).where(eq(panels.id, id)).run();
}

/** Re-snapshot the source folder (owner must be logged in for the DEK). */
export function regeneratePanel(ctx: AuthedContext, id: string): PanelDetail {
  const row = getDb()
    .select()
    .from(panels)
    .where(and(eq(panels.id, id), eq(panels.userId, ctx.userId)))
    .get();
  if (!row) throw NotFound("Panel not found");
  materialize(ctx, id, row.folderId);
  return getPanel(ctx, id);
}

/**
 * Public/authenticated view resolution. `viewerUserId` is the logged-in user
 * if any (for "users" mode). Returns a gate flag (needsPassword/needsAuth/
 * forbidden) instead of the tree when access isn't granted.
 */
export async function resolvePublicPanel(
  slug: string,
  opts: { password?: string; viewerUserId?: string },
): Promise<PublicPanelResponse> {
  const row = getDb().select().from(panels).where(eq(panels.slug, slug)).get();
  if (!row) throw NotFound("Panel not found");
  const template = resolveTemplateConfig(row.templateId, row.userId);
  const base = {
    title: row.title,
    template,
    displayTitle: row.displayTitle ?? null,
    tabTitle: row.tabTitle ?? null,
    faviconEmoji: row.faviconEmoji ?? null,
    bgAssetKind: panelBgKind(row.bgMime),
    bgAssetVersion: row.bgBlobPath ? row.updatedAt : null,
    faviconKind: faviconKindOf(row),
    faviconVersion: row.faviconBlobPath ? row.updatedAt : null,
  };

  if (row.accessMode === "password") {
    if (!row.passwordHash) throw NotFound("Panel not found");
    if (!opts.password) return { ...base, needsPassword: true };
    const ok = await verifyPassword(row.passwordHash, opts.password);
    if (!ok) throw Unauthorized("Contraseña incorrecta");
  } else if (row.accessMode === "users") {
    if (!opts.viewerUserId) return { ...base, needsAuth: true };
    const allowed =
      opts.viewerUserId === row.userId ||
      allowedUserIds(row.id).includes(opts.viewerUserId);
    if (!allowed) return { ...base, forbidden: true };
  }

  if (row.payloadStatus !== "ready" || !row.payloadCt) {
    throw NotFound("El panel aún se está generando");
  }
  const json = masterUnwrap(row.userId, Buffer.from(row.payloadCt)).toString("utf8");
  return { ...base, root: JSON.parse(json) };
}

/** Persist a freshly stored background asset (path already written to disk). */
export function setPanelBgAsset(
  ctx: AuthedContext,
  id: string,
  path: string,
  mime: string,
): PanelDetail {
  const row = getDb()
    .select({ id: panels.id, bgBlobPath: panels.bgBlobPath })
    .from(panels)
    .where(and(eq(panels.id, id), eq(panels.userId, ctx.userId)))
    .get();
  if (!row) throw NotFound("Panel not found");
  const previous = row.bgBlobPath;
  getDb()
    .update(panels)
    .set({ bgBlobPath: path, bgMime: mime, updatedAt: new Date().toISOString() })
    .where(eq(panels.id, id))
    .run();
  // Drop the old file if it was stored at a different path (defensive; we reuse
  // the same filename today, so this is usually a no-op).
  if (previous && previous !== path) void deleteBlob(previous);
  return getPanel(ctx, id);
}

/** Remove a panel's custom background asset (clears the row + deletes the file). */
export function clearPanelBgAsset(ctx: AuthedContext, id: string): PanelDetail {
  const row = getDb()
    .select({ id: panels.id, bgBlobPath: panels.bgBlobPath })
    .from(panels)
    .where(and(eq(panels.id, id), eq(panels.userId, ctx.userId)))
    .get();
  if (!row) throw NotFound("Panel not found");
  getDb()
    .update(panels)
    .set({ bgBlobPath: null, bgMime: null, updatedAt: new Date().toISOString() })
    .where(eq(panels.id, id))
    .run();
  if (row.bgBlobPath) void deleteBlob(row.bgBlobPath);
  return getPanel(ctx, id);
}

/** Persist a freshly stored tab icon (and drop the emoji, they are exclusive). */
export function setPanelFaviconAsset(
  ctx: AuthedContext,
  id: string,
  path: string,
  mime: string,
): PanelDetail {
  const row = getDb()
    .select({ id: panels.id, faviconBlobPath: panels.faviconBlobPath })
    .from(panels)
    .where(and(eq(panels.id, id), eq(panels.userId, ctx.userId)))
    .get();
  if (!row) throw NotFound("Panel not found");
  const previous = row.faviconBlobPath;
  getDb()
    .update(panels)
    .set({
      faviconBlobPath: path,
      faviconMime: mime,
      faviconEmoji: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(panels.id, id))
    .run();
  if (previous && previous !== path) void deleteBlob(previous);
  return getPanel(ctx, id);
}

/** Remove a panel's uploaded tab icon. */
export function clearPanelFaviconAsset(ctx: AuthedContext, id: string): PanelDetail {
  const row = getDb()
    .select({ id: panels.id, faviconBlobPath: panels.faviconBlobPath })
    .from(panels)
    .where(and(eq(panels.id, id), eq(panels.userId, ctx.userId)))
    .get();
  if (!row) throw NotFound("Panel not found");
  getDb()
    .update(panels)
    .set({ faviconBlobPath: null, faviconMime: null, updatedAt: new Date().toISOString() })
    .where(eq(panels.id, id))
    .run();
  if (row.faviconBlobPath) void deleteBlob(row.faviconBlobPath);
  return getPanel(ctx, id);
}

/** Tab icon for public streaming. Decorative, so gated like the background. */
export function panelFaviconForPublic(
  slug: string,
  viewerUserId?: string,
): { path: string; mime: string; updatedAt: string; ownerId: string } | null {
  const row = getDb().select().from(panels).where(eq(panels.slug, slug)).get();
  if (!row || !row.faviconBlobPath || !row.faviconMime) return null;
  if (row.accessMode === "users") {
    const allowed =
      !!viewerUserId &&
      (viewerUserId === row.userId || allowedUserIds(row.id).includes(viewerUserId));
    if (!allowed) return null;
  }
  return {
    path: row.faviconBlobPath,
    mime: row.faviconMime,
    updatedAt: row.updatedAt,
    ownerId: row.userId,
  };
}

/**
 * Resolve a panel's background asset for public streaming. Mirrors the payload
 * access model but is decorative: `public`/`password` panels serve it freely
 * (a browser can't attach a password to an <img>/<video> request), while
 * `users` panels require an authorized session. Returns null when there is no
 * asset or the viewer isn't allowed (the route then answers 404).
 */
export function panelBgForPublic(
  slug: string,
  viewerUserId?: string,
): { path: string; mime: string; updatedAt: string; ownerId: string } | null {
  const row = getDb().select().from(panels).where(eq(panels.slug, slug)).get();
  if (!row || !row.bgBlobPath || !row.bgMime) return null;
  if (row.accessMode === "users") {
    const allowed =
      !!viewerUserId &&
      (viewerUserId === row.userId || allowedUserIds(row.id).includes(viewerUserId));
    if (!allowed) return null;
  }
  return { path: row.bgBlobPath, mime: row.bgMime, updatedAt: row.updatedAt, ownerId: row.userId };
}
