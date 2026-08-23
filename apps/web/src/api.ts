import type {
  AdminStorageRow,
  ArchiveScope,
  Attachment,
  AttachmentEntity,
  CreateColumnBody,
  CreateViewBody,
  DatabaseDetail,
  DatabaseSummary,
  DbColumn,
  DbRow,
  DbView,
  RefCandidate,
  ResolveRefsBody,
  ResolvedRef,
  UpdateAttachmentBody,
  ImportArchiveResult,
  CloudBackup,
  PeerCertificate,
  AdminUser,
  AppSettings,
  Bookmark,
  CloudConnection,
  CreateBookmarkBody,
  CreateFolderBody,
  CreateGroupBody,
  CreateShareBody,
  CreateSmartFolderBody,
  CreateTagBody,
  DuplicateGroup,
  Folder,
  MergeBookmarksResult,
  SmartFolder,
  SecurityLogPage,
  SecurityLogQuery,
  SecuritySummary,
  StorageUsage,
  TrashItem,
  UserSession,
  UpdateSmartFolderBody,
  Group,
  GroupInvitation,
  SentInvitation,
  GroupMember,
  InviteMemberBody,
  CreatePanelBody,
  CreateTemplateBody,
  MeResponse,
  PanelDetail,
  PanelListItem,
  PublicPanelResponse,
  Share,
  EditSharedNodeBody,
  SharedItem,
  ShareToGroupBody,
  GroupRole,
  ShareToGroupsBody,
  ShareResult,
  Tag,
  TemplateItem,
  TwoFactorSetupResponse,
  UpdateAppSettingsBody,
  UpdatePanelBody,
  UpdateTemplateBody,
  UpdateBookmarkBody,
  UpdateColumnBody,
  UpdateRowBody,
  UpdateViewBody,
  UpdateFolderBody,
  UpdateGroupBody,
  UpdateTagBody,
  UserRole,
} from "@awesome-bookmarks/shared";

const BASE = "/api";

/**
 * Public URL of a panel, built from the browser's own origin so it is always
 * correct for however you reach the app (no PUBLIC_BASE_URL needed).
 */
export function panelPublicUrl(slug: string): string {
  return `${window.location.origin}/panel/${slug}`;
}

async function iconError(res: Response): Promise<ApiError> {
  const text = await res.text();
  let msg = `Subida de icono fallida (HTTP ${res.status})`;
  try {
    const parsed = JSON.parse(text) as { error?: string; code?: string };
    if (parsed.error) msg = parsed.error;
  } catch {
    /* keep default */
  }
  return new ApiError(res.status, "icon_failed", msg);
}

function extFromContentType(ct: string): string {
  const lower = ct.toLowerCase();
  if (lower.includes("png")) return ".png";
  if (lower.includes("jpeg") || lower.includes("jpg")) return ".jpg";
  if (lower.includes("gif")) return ".gif";
  if (lower.includes("webp")) return ".webp";
  if (lower.includes("svg")) return ".svg";
  return ".ico";
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

/** True for a 409 optimistic-concurrency rejection (a stale `baseRev`). */
export function isConflict(e: unknown): boolean {
  return e instanceof ApiError && e.status === 409;
}

export type VersionEntity = "folder" | "bookmark";
export interface VersionMeta {
  id: string;
  entityType: VersionEntity;
  entityId: string;
  rev: number;
  actorId: string;
  createdAt: string;
}
export interface FolderSnapshot {
  name: string;
  description: string | null;
  bgColor: string | null;
  tagIds: string[];
}
export interface BookmarkSnapshot {
  title: string;
  url: string;
  description: string | null;
  bgColor: string | null;
  folderId: string | null;
  tagIds: string[];
}
export interface VersionDetail extends VersionMeta {
  snapshot: FolderSnapshot | BookmarkSnapshot;
}
export interface ActivityEntry extends VersionMeta {
  label: string;
}

/**
 * When any request returns 401 (session expired / missing cookie) or 423
 * (KeyUnavailable — DEK evicted from cache), broadcast a window event so
 * AuthProvider can clear the cached "me" and let RequireAuth bounce the
 * user back to /login. Otherwise the SPA stays on a "logged-in" route
 * with every API call failing silently.
 */
function signalAuthInvalidated(status: number) {
  if (status === 401 || status === 423) {
    window.dispatchEvent(
      new CustomEvent("auth:invalidated", { detail: { status } }),
    );
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  // Only declare a JSON content-type when we actually send a body. Fastify v5
  // rejects requests with `Content-Type: application/json` and an empty body
  // (FST_ERR_CTP_EMPTY_JSON_BODY), which broke DELETE/refresh/logout calls.
  const hasBody = init.body !== undefined && init.body !== null;
  const headers: Record<string, string> = {};
  if (hasBody) headers["content-type"] = "application/json";
  if (init.headers) {
    for (const [k, v] of Object.entries(init.headers as Record<string, string>)) {
      headers[k.toLowerCase()] = v;
    }
  }

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });
  signalAuthInvalidated(res.status);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(
      res.status,
      body?.code ?? "unknown",
      body?.error ?? `HTTP ${res.status}`,
    );
  }
  return body as T;
}

export const api = {
  // auth
  signup: (email: string, nickname: string, password: string) =>
    request<MeResponse>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, nickname, password }),
    }),
  login: (identifier: string, password: string, totp?: string) =>
    request<MeResponse | { twoFactorRequired: true }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password, totp }),
    }),
  twoFactorSetup: () =>
    request<TwoFactorSetupResponse>("/2fa/setup", { method: "POST" }),
  twoFactorEnable: (code: string) =>
    request<{ ok: true }>("/2fa/enable", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  twoFactorDisable: (code: string) =>
    request<{ ok: true }>("/2fa/disable", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),

  // passkeys (WebAuthn) — options/responses are opaque WebAuthn JSON
  webauthnConfig: () =>
    request<{ enabled: boolean; rpId: string | null; allowPrfless: boolean }>(
      "/webauthn/config",
    ),
  webauthnRegisterOptions: () =>
    request<unknown>("/webauthn/register/options", { method: "POST" }),
  webauthnRegisterVerify: (body: {
    response: unknown;
    prfSecret: string;
    label: string;
  }) =>
    request<{ ok: true }>("/webauthn/register/verify", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  webauthnLoginOptions: () =>
    request<unknown>("/webauthn/login/options", { method: "POST" }),
  webauthnLoginVerify: (body: { response: unknown; prfSecret: string }) =>
    request<MeResponse>("/webauthn/login/verify", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  webauthnCredentials: () =>
    request<
      { id: string; label: string; createdAt: string; lastUsedAt: string | null }[]
    >("/webauthn/credentials"),
  webauthnDeleteCredential: (id: string) =>
    request<void>(`/webauthn/credentials/${id}`, { method: "DELETE" }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  firstPassword: (newPassword: string) =>
    request<{ ok: true }>("/auth/first-password", {
      method: "POST",
      body: JSON.stringify({ newPassword }),
    }),
  authConfig: () =>
    request<{ registrationEnabled: boolean }>("/auth/config"),
  me: () => request<MeResponse>("/me"),
  /** The server's clock, for comparing against the reader's. */
  serverTime: () =>
    request<{ now: string; timeZone: string; offsetMinutes: number }>("/time"),
  updateMyProfile: (body: {
    nickname?: string;
    autoSnapshots?: boolean;
    autoAcceptInvitations?: boolean;
  }) =>
    request<MeResponse>("/me", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  // folders
  listFolders: () => request<Folder[]>("/folders"),
  createFolder: (body: CreateFolderBody) =>
    request<Folder>("/folders", { method: "POST", body: JSON.stringify(body) }),
  updateFolder: (id: string, body: UpdateFolderBody) =>
    request<Folder>(`/folders/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  moveFolder: (id: string, newParentId: string | null, position: number) =>
    request<{ ok: true }>(`/folders/${id}/move`, {
      method: "POST",
      body: JSON.stringify({ newParentId, position }),
    }),
  copyFolder: (id: string, parentId: string | null = null) =>
    request<{ id: string; type: "folder" | "bookmark" }>(
      `/folders/${id}/copy`,
      { method: "POST", body: JSON.stringify({ parentId }) },
    ),
  deleteFolder: (id: string) =>
    request<void>(`/folders/${id}`, { method: "DELETE" }),

  // bookmarks
  listBookmarks: (params: { folderId?: string; tagId?: string; q?: string }) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null) as [string, string][],
    ).toString();
    return request<Bookmark[]>(`/bookmarks${qs ? `?${qs}` : ""}`);
  },
  getBookmark: (id: string) => request<Bookmark>(`/bookmarks/${id}`),
  createBookmark: (body: CreateBookmarkBody) =>
    request<Bookmark>("/bookmarks", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateBookmark: (id: string, body: UpdateBookmarkBody) =>
    request<Bookmark>(`/bookmarks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteBookmark: (id: string) =>
    request<void>(`/bookmarks/${id}`, { method: "DELETE" }),
  moveBookmark: (id: string, newFolderId: string | null, position: number) =>
    request<{ ok: true }>(`/bookmarks/${id}/move`, {
      method: "POST",
      body: JSON.stringify({ newFolderId, position }),
    }),
  copyBookmark: (id: string, folderId: string | null = null) =>
    request<{ id: string; type: "folder" | "bookmark" }>(
      `/bookmarks/${id}/copy`,
      { method: "POST", body: JSON.stringify({ folderId }) },
    ),
  refreshSnapshot: (id: string) =>
    request<{ ok: true }>(`/bookmarks/${id}/refresh-snapshot`, {
      method: "POST",
    }),

  // tags
  listTags: () => request<Tag[]>("/tags"),
  createTag: (body: CreateTagBody) =>
    request<Tag>("/tags", { method: "POST", body: JSON.stringify(body) }),
  updateTag: (id: string, body: UpdateTagBody) =>
    request<Tag>(`/tags/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteTag: (id: string) =>
    request<void>(`/tags/${id}`, { method: "DELETE" }),

  // smart folders (saved queries shown in the sidebar)
  listSmartFolders: () => request<SmartFolder[]>("/smart-folders"),
  getSmartFolder: (id: string) => request<SmartFolder>(`/smart-folders/${id}`),
  createSmartFolder: (body: CreateSmartFolderBody) =>
    request<SmartFolder>("/smart-folders", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateSmartFolder: (id: string, body: UpdateSmartFolderBody) =>
    request<SmartFolder>(`/smart-folders/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteSmartFolder: (id: string) =>
    request<void>(`/smart-folders/${id}`, { method: "DELETE" }),

  // trash (soft-deleted folders and bookmarks)
  listTrash: (rootLabel?: string) =>
    request<TrashItem[]>(
      `/trash${rootLabel ? `?rootLabel=${encodeURIComponent(rootLabel)}` : ""}`,
    ),
  trashCount: () => request<{ count: number }>("/trash/count"),
  restoreTrash: (type: "folder" | "bookmark", id: string) =>
    request<{ folders: number; bookmarks: number; movedToRoot: boolean }>(
      "/trash/restore",
      { method: "POST", body: JSON.stringify({ type, id }) },
    ),
  purgeTrashItem: (type: "folder" | "bookmark", id: string) =>
    request<void>(`/trash/${type}/${id}`, { method: "DELETE" }),
  purgeTrash: (olderThanDays?: number) =>
    request<{ folders: number; bookmarks: number }>(
      `/trash${olderThanDays === undefined ? "" : `?olderThanDays=${olderThanDays}`}`,
      { method: "DELETE" },
    ),

  // security log (admin)
  securityLog: (q: Partial<SecurityLogQuery>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) {
      if (v !== undefined && v !== "" && v !== false) params.set(k, String(v));
    }
    const qs = params.toString();
    return request<SecurityLogPage>(`/security-log${qs ? `?${qs}` : ""}`);
  },
  securitySummary: (hours: number) =>
    request<SecuritySummary>(`/security-log/summary?hours=${hours}`),
  securityRetention: () => request<{ days: number }>("/security-log/retention"),
  setSecurityRetention: (days: number) =>
    request<{ days: number; pruned: number }>("/security-log/retention", {
      method: "PATCH",
      body: JSON.stringify({ days }),
    }),

  // active logins
  listSessions: () => request<UserSession[]>("/sessions"),
  revokeSession: (id: string) =>
    request<void>(`/sessions/${id}`, { method: "DELETE" }),
  revokeOtherSessions: () =>
    request<{ revoked: number }>("/sessions", { method: "DELETE" }),

  // storage usage + quotas
  myStorage: (fresh = false) =>
    request<StorageUsage>(`/storage/me${fresh ? "?fresh=1" : ""}`),
  adminListStorage: () => request<AdminStorageRow[]>("/admin/storage"),
  adminSetUserQuota: (id: string, quotaBytes: number | null) =>
    request<{ ok: true }>(`/admin/users/${id}/quota`, {
      method: "PATCH",
      body: JSON.stringify({ quotaBytes }),
    }),

  // duplicates
  listDuplicates: () => request<DuplicateGroup[]>("/bookmarks/duplicates"),
  mergeBookmarks: (keepId: string, mergeIds: string[]) =>
    request<MergeBookmarksResult>("/bookmarks/merge", {
      method: "POST",
      body: JSON.stringify({ keepId, mergeIds }),
    }),

  // search
  search: (q: string, opts: { folderId?: string | null } = {}) => {
    const params = new URLSearchParams({ q });
    if (opts.folderId) params.set("folderId", opts.folderId);
    return request<Array<{ bookmark: Bookmark; snippet?: string }>>(
      `/search?${params.toString()}`,
    );
  },

  // import / export
  importHtml: async (
    file: File,
    options: {
      fetchSnapshots?: boolean;
      parentId?: string | null;
      wrapperFolderName?: string;
    } = {},
  ) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("fetchSnapshots", String(options.fetchSnapshots ?? false));
    if (options.parentId) fd.append("parentId", options.parentId);
    if (options.wrapperFolderName)
      fd.append("wrapperFolderName", options.wrapperFolderName);
    const res = await fetch(`${BASE}/import/html`, {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    signalAuthInvalidated(res.status);
    if (!res.ok) throw new ApiError(res.status, "import_failed", "Import failed");
    return (await res.json()) as { jobId: string };
  },

  /** The app's own format: everything, importable back into a folder. */
  exportArchive: async (body: {
    scope: ArchiveScope;
    id?: string;
    includeSnapshots?: boolean;
    passphrase?: string;
  }): Promise<void> => {
    const res = await fetch(`${BASE}/export/archive`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    signalAuthInvalidated(res.status);
    if (!res.ok) {
      const text = await res.text();
      let msg = `Export failed (HTTP ${res.status})`;
      try {
        msg = (JSON.parse(text) as { error?: string }).error ?? msg;
      } catch {
        /* keep default */
      }
      throw new ApiError(res.status, "export_failed", msg);
    }
    const disposition = res.headers.get("content-disposition") ?? "";
    const filename =
      /filename="([^"]+)"/.exec(disposition)?.[1] ?? "awesomebookmarks.abz";
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  importArchive: async (
    file: File,
    options: { parentId?: string | null; passphrase?: string } = {},
  ): Promise<ImportArchiveResult> => {
    const fd = new FormData();
    fd.append("file", file);
    if (options.parentId) fd.append("parentId", options.parentId);
    if (options.passphrase) fd.append("passphrase", options.passphrase);
    const res = await fetch(`${BASE}/import/archive`, {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    signalAuthInvalidated(res.status);
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) {
      throw new ApiError(
        res.status,
        body?.code ?? "import_failed",
        body?.error ?? `HTTP ${res.status}`,
      );
    }
    return body as ImportArchiveResult;
  },

  exportBookmarksHtml: async (body: {
    folderIds?: string[];
    bookmarkIds?: string[];
  }): Promise<void> => {
    const res = await fetch(`${BASE}/export/bookmarks-html`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        folderIds: body.folderIds ?? [],
        bookmarkIds: body.bookmarkIds ?? [],
      }),
    });
    signalAuthInvalidated(res.status);
    if (!res.ok) {
      const text = await res.text();
      let msg = `Export failed (HTTP ${res.status})`;
      try {
        msg = (JSON.parse(text) as { error?: string }).error ?? msg;
      } catch {
        /* keep default */
      }
      throw new ApiError(res.status, "export_failed", msg);
    }
    const disposition = res.headers.get("content-disposition") ?? "";
    const match = /filename="([^"]+)"/.exec(disposition);
    const filename = match?.[1] ?? "bookmarks.html";
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  // shares
  listShares: () => request<Share[]>("/shares"),
  createShare: (body: CreateShareBody) =>
    request<Share>("/shares", { method: "POST", body: JSON.stringify(body) }),
  deleteShare: (id: string) =>
    request<void>(`/shares/${id}`, { method: "DELETE" }),

  // icons / images (URL helpers — used as <img src=>)
  // The blob is overwritten in place, so the URL is otherwise stable; pass the
  // entity's updatedAt as a cache-busting `v` so the browser refetches (and
  // the <img>/CSS reloads) the moment the icon/background changes.
  folderIconUrl: (id: string, v?: string) =>
    `${BASE}/folders/${id}/icon${v ? `?v=${encodeURIComponent(v)}` : ""}`,
  folderBgImageUrl: (id: string, v?: string) =>
    `${BASE}/folders/${id}/bg-image${v ? `?v=${encodeURIComponent(v)}` : ""}`,
  bookmarkIconUrl: (id: string, v?: string) =>
    `${BASE}/bookmarks/${id}/icon${v ? `?v=${encodeURIComponent(v)}` : ""}`,
  bookmarkBgImageUrl: (id: string, v?: string) =>
    `${BASE}/bookmarks/${id}/bg-image${v ? `?v=${encodeURIComponent(v)}` : ""}`,
  bookmarkSnapshotUrl: (id: string) => `${BASE}/bookmarks/${id}/snapshot.html`,
  // A node's icon/background *inside a group share*. Not the same URL as the
  // owner's: the share keeps its own copy sealed with the group key, since
  // the owner's blobs need the owner's key and they may be offline.
  sharedAssetUrl: (
    shareId: string,
    nodeId: string,
    kind: "icon" | "image",
    v?: string,
  ) =>
    `${BASE}/shared/${shareId}/asset/${nodeId}/${kind}${
      v ? `?v=${encodeURIComponent(v)}` : ""
    }`,
  uploadFolderIcon: async (id: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${BASE}/folders/${id}/icon`, {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    signalAuthInvalidated(res.status);
    if (!res.ok) throw await iconError(res);
    return res.json() as Promise<{ iconBlobPath: string }>;
  },
  fetchFaviconForUrl: async (url: string): Promise<File> => {
    const res = await fetch(`${BASE}/icons/fetch-favicon`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
    signalAuthInvalidated(res.status);
    if (!res.ok) {
      const text = await res.text();
      let msg = "No se pudo obtener el favicon";
      try {
        msg = (JSON.parse(text) as { error?: string }).error ?? msg;
      } catch {
        /* keep default */
      }
      throw new ApiError(res.status, "favicon_fetch_failed", msg);
    }
    const ct = res.headers.get("content-type") ?? "image/x-icon";
    const ext = extFromContentType(ct);
    const blob = await res.blob();
    return new File([blob], `favicon${ext}`, { type: ct });
  },
  fetchImageFromUrl: async (url: string): Promise<File> => {
    const res = await fetch(`${BASE}/icons/fetch-image`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
    signalAuthInvalidated(res.status);
    if (!res.ok) {
      const text = await res.text();
      let msg = "No se pudo descargar la imagen";
      try {
        msg = (JSON.parse(text) as { error?: string }).error ?? msg;
      } catch {
        /* keep default */
      }
      throw new ApiError(res.status, "image_fetch_failed", msg);
    }
    const ct = res.headers.get("content-type") ?? "image/png";
    const ext = extFromContentType(ct);
    const blob = await res.blob();
    return new File([blob], `image${ext}`, { type: ct });
  },
  uploadBookmarkIcon: async (id: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${BASE}/bookmarks/${id}/icon`, {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    signalAuthInvalidated(res.status);
    if (!res.ok) throw await iconError(res);
    return res.json() as Promise<{ iconBlobPath: string }>;
  },
  // attachments — a separate query from the entity itself, deliberately: the
  // grid and the bookmark list never pay for a file the user has not asked to
  // see, so browsing costs exactly what it did before the feature existed.
  listAttachments: (entity: AttachmentEntity, id: string) =>
    request<Attachment[]>(`/${entity}s/${id}/attachments`),
  uploadAttachment: async (
    entity: AttachmentEntity,
    id: string,
    file: File,
    meta: { name?: string; description?: string; slug?: string } = {},
  ): Promise<Attachment> => {
    const fd = new FormData();
    fd.append("file", file);
    if (meta.name) fd.append("name", meta.name);
    if (meta.description) fd.append("description", meta.description);
    if (meta.slug) fd.append("slug", meta.slug);
    const res = await fetch(`${BASE}/${entity}s/${id}/attachments`, {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    signalAuthInvalidated(res.status);
    if (!res.ok) {
      const text = await res.text();
      let msg = `Subida fallida (HTTP ${res.status})`;
      let code = "upload_failed";
      try {
        const parsed = JSON.parse(text) as { error?: string; code?: string };
        if (parsed.error) msg = parsed.error;
        if (parsed.code) code = parsed.code;
      } catch {
        /* keep the default */
      }
      throw new ApiError(res.status, code, msg);
    }
    return res.json() as Promise<Attachment>;
  },
  updateAttachment: (id: string, body: UpdateAttachmentBody) =>
    request<Attachment>(`/attachments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  /** Every file in the account, for the reference picker. */
  allAttachments: () => request<Attachment[]>("/attachments/all"),
  deleteAttachment: (id: string) =>
    request<void>(`/attachments/${id}`, { method: "DELETE" }),

  // inline databases
  listDatabases: () => request<DatabaseSummary[]>("/databases"),
  createDatabase: (name: string) =>
    request<DatabaseDetail>("/databases", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  getDatabase: (id: string, blockId?: string | null) =>
    request<DatabaseDetail>(
      `/databases/${id}${blockId ? `?block=${encodeURIComponent(blockId)}` : ""}`,
    ),
  renameDatabase: (id: string, name: string) =>
    request<DatabaseSummary>(`/databases/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  deleteDatabase: (id: string) =>
    request<void>(`/databases/${id}`, { method: "DELETE" }),

  addDbColumn: (id: string, body: CreateColumnBody) =>
    request<DbColumn>(`/databases/${id}/columns`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateDbColumn: (id: string, columnId: string, body: UpdateColumnBody) =>
    request<DbColumn>(`/databases/${id}/columns/${columnId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteDbColumn: (id: string, columnId: string) =>
    request<void>(`/databases/${id}/columns/${columnId}`, { method: "DELETE" }),

  addDbRow: (id: string, cells: DbRow["cells"] = {}) =>
    request<DbRow>(`/databases/${id}/rows`, {
      method: "POST",
      body: JSON.stringify({ cells }),
    }),
  updateDbRow: (id: string, rowId: string, body: UpdateRowBody) =>
    request<DbRow>(`/databases/${id}/rows/${rowId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteDbRow: (id: string, rowId: string) =>
    request<void>(`/databases/${id}/rows/${rowId}`, { method: "DELETE" }),
  reorderDbRows: (id: string, order: string[]) =>
    request<{ ok: true }>(`/databases/${id}/rows/reorder`, {
      method: "POST",
      body: JSON.stringify({ order }),
    }),

  addDbView: (id: string, body: CreateViewBody) =>
    request<DbView>(`/databases/${id}/views`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateDbView: (id: string, viewId: string, body: UpdateViewBody) =>
    request<DbView>(`/databases/${id}/views/${viewId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteDbView: (id: string, viewId: string) =>
    request<void>(`/databases/${id}/views/${viewId}`, { method: "DELETE" }),

  // references inside descriptions
  searchRefs: (q: string) =>
    request<RefCandidate[]>(`/refs/search?q=${encodeURIComponent(q)}`),
  resolveRefs: (refs: ResolveRefsBody["refs"]) =>
    request<ResolvedRef[]>("/refs/resolve", {
      method: "POST",
      body: JSON.stringify({ refs }),
    }),
  /** Download URL. `inline` is honoured only for real raster images. */
  attachmentUrl: (id: string, inline = false) =>
    `${BASE}/attachments/${id}${inline ? "?inline=1" : ""}`,

  uploadFolderBgImage: async (id: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${BASE}/folders/${id}/bg-image`, {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    signalAuthInvalidated(res.status);
    if (!res.ok) throw await iconError(res);
    return res.json() as Promise<{ imageBlobPath: string }>;
  },
  uploadBookmarkBgImage: async (id: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${BASE}/bookmarks/${id}/bg-image`, {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    signalAuthInvalidated(res.status);
    if (!res.ok) throw await iconError(res);
    return res.json() as Promise<{ imageBlobPath: string }>;
  },
  clearFolderBgImage: (id: string) =>
    request<void>(`/folders/${id}/bg-image`, { method: "DELETE" }),
  clearBookmarkBgImage: (id: string) =>
    request<void>(`/bookmarks/${id}/bg-image`, { method: "DELETE" }),

  // groups
  listGroups: () => request<Group[]>("/groups"),
  createGroup: (body: CreateGroupBody) =>
    request<Group>("/groups", { method: "POST", body: JSON.stringify(body) }),
  getGroup: (id: string) => request<Group>(`/groups/${id}`),
  updateGroup: (id: string, body: UpdateGroupBody) =>
    request<{ ok: true }>(`/groups/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteGroup: (id: string) =>
    request<void>(`/groups/${id}`, { method: "DELETE" }),
  listGroupMembers: (id: string) =>
    request<GroupMember[]>(`/groups/${id}/members`),
  removeGroupMember: (id: string, userId: string) =>
    request<void>(`/groups/${id}/members/${userId}`, { method: "DELETE" }),
  leaveGroup: (id: string) =>
    request<{ ok: true }>(`/groups/${id}/leave`, { method: "POST" }),
  inviteMember: (id: string, body: InviteMemberBody) =>
    request<{
      id: string;
      token: string;
      email: string;
      expiresAt: string | null;
      autoAccepted: boolean;
    }>(`/groups/${id}/invitations`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  notificationsUrl: () => `${BASE}/notifications/stream`,
  listMyInvitations: () => request<GroupInvitation[]>("/invitations"),
  acceptInvitation: (token: string) =>
    request<{ groupId: string }>(`/invitations/${encodeURIComponent(token)}/accept`, {
      method: "POST",
    }),
  rejectInvitation: (token: string) =>
    request<{ ok: boolean }>(
      `/invitations/${encodeURIComponent(token)}/reject`,
      { method: "POST" },
    ),
  listGroupInvitations: (id: string) =>
    request<SentInvitation[]>(`/groups/${id}/invitations`),
  cancelInvitation: (id: string, invId: string) =>
    request<void>(`/groups/${id}/invitations/${invId}`, { method: "DELETE" }),
  listSharesByMe: () => request<SharedItem[]>("/shared/by-me"),
  importShare: (
    shareId: string,
    parentId: string | null = null,
    mode: "link" | "copy" = "link",
  ) =>
    request<{ id: string; type: "folder" | "bookmark" }>(
      `/shared/${shareId}/import`,
      { method: "POST", body: JSON.stringify({ parentId, mode }) },
    ),
  shareToGroup: (id: string, body: ShareToGroupBody) =>
    request<{ id: string }>(`/groups/${id}/shares`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  /** Share one thing with several groups in a single call. */
  shareToGroups: (body: ShareToGroupsBody) =>
    request<ShareResult[]>("/shares/to-groups", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  setMemberRole: (groupId: string, userId: string, role: GroupRole) =>
    request<{ ok: true }>(`/groups/${groupId}/members/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),
  listGroupShares: (id: string) =>
    request<SharedItem[]>(`/groups/${id}/shares`),
  deleteGroupShare: (groupId: string, shareId: string) =>
    request<void>(`/groups/${groupId}/shares/${shareId}`, { method: "DELETE" }),

  // shared (everything from all my groups)
  listShared: () => request<SharedItem[]>("/shared"),
  getSharedContent: (shareId: string) =>
    request<unknown>(`/shared/${shareId}`),
  /** Which row a share points at, and whether this caller can open it. */
  getShareSource: (shareId: string) =>
    request<
      | { type: "folder" | "bookmark" | "database"; id: string; reachable: boolean }
      | { error: string }
    >(`/shared/${shareId}/source`),
  createSharedFolder: (
    shareId: string,
    body: { parentId?: string | null; name: string; baseRev?: number },
  ) =>
    request<{ id: string; rev: number }>(`/shared/${shareId}/folders`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  createSharedBookmark: (
    shareId: string,
    body: { folderId?: string | null; url: string; title?: string; baseRev?: number },
  ) =>
    request<{ id: string; rev: number }>(`/shared/${shareId}/bookmarks`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  moveSharedNode: (
    shareId: string,
    nodeId: string,
    folderId: string | null,
    position?: number,
    baseRev?: number,
  ) =>
    request<{ rev: number }>(`/shared/${shareId}/node/${nodeId}/move`, {
      method: "POST",
      body: JSON.stringify({ folderId, position, baseRev }),
    }),
  uploadSharedAsset: async (
    shareId: string,
    nodeId: string,
    kind: "icon" | "image",
    file: File,
  ): Promise<{ rev: number }> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(
      `${BASE}/shared/${shareId}/node/${nodeId}/asset/${kind}`,
      { method: "POST", credentials: "include", body: fd },
    );
    signalAuthInvalidated(res.status);
    if (!res.ok) throw await iconError(res);
    return (await res.json()) as { rev: number };
  },
  clearSharedAsset: (shareId: string, nodeId: string) =>
    request<{ rev: number }>(
      `/shared/${shareId}/node/${nodeId}/asset/image`,
      { method: "DELETE" },
    ),
  setSharedFavorite: (
    shareId: string,
    nodeId: string,
    favorite: boolean,
    baseRev?: number,
  ) =>
    request<{ rev: number }>(`/shared/${shareId}/node/${nodeId}/favorite`, {
      method: "PUT",
      body: JSON.stringify({ favorite, baseRev }),
    }),
  setSharedTags: (
    shareId: string,
    nodeId: string,
    tags: string[],
    baseRev?: number,
  ) =>
    request<{ rev: number }>(`/shared/${shareId}/node/${nodeId}/tags`, {
      method: "PUT",
      body: JSON.stringify({ tags, baseRev }),
    }),
  setSharedAppearance: (
    shareId: string,
    nodeId: string,
    body: { bgColor?: string | null; textTone?: string | null; baseRev?: number },
  ) =>
    request<{ rev: number }>(`/shared/${shareId}/node/${nodeId}/appearance`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteSharedNode: (shareId: string, nodeId: string, baseRev?: number) =>
    request<{ rev: number }>(`/shared/${shareId}/node/${nodeId}`, {
      method: "DELETE",
      body: JSON.stringify({ baseRev }),
    }),
  editSharedNode: (shareId: string, nodeId: string, body: EditSharedNodeBody) =>
    request<unknown>(`/shared/${shareId}/node/${nodeId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  // version history
  listVersions: (entityType: VersionEntity, id: string) =>
    request<VersionMeta[]>(`/${entityType}s/${id}/versions`),
  getVersion: (versionId: string) =>
    request<VersionDetail>(`/versions/${versionId}`),
  restoreVersion: (entityType: VersionEntity, id: string, versionId: string) =>
    request<unknown>(`/${entityType}s/${id}/versions/${versionId}/restore`, {
      method: "POST",
    }),
  forkVersion: (
    entityType: VersionEntity,
    id: string,
    versionId: string,
    body: { name?: string; title?: string },
  ) =>
    request<{ id: string }>(
      `/${entityType}s/${id}/versions/${versionId}/fork`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  folderActivity: (id: string) =>
    request<ActivityEntry[]>(`/folders/${id}/activity`),

  // symlinks (aliases) to an existing folder/bookmark
  createAlias: (body: {
    targetType: "folder" | "bookmark";
    targetId: string;
    parentId: string | null;
  }) =>
    request<Folder | Bookmark>("/aliases", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // panels
  listPanels: () => request<PanelListItem[]>("/panels"),
  getPanel: (id: string) => request<PanelDetail>(`/panels/${id}`),
  createPanel: (body: CreatePanelBody) =>
    request<PanelDetail>("/panels", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updatePanel: (id: string, body: UpdatePanelBody) =>
    request<PanelDetail>(`/panels/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deletePanel: (id: string) =>
    request<void>(`/panels/${id}`, { method: "DELETE" }),
  regeneratePanel: (id: string) =>
    request<PanelDetail>(`/panels/${id}/regenerate`, { method: "POST" }),
  // Custom panel background asset (image/gif/video). URL is public (served
  // MASTER_KEY-sealed); pass the panel's updatedAt as `v` to bust the cache.
  panelBgUrl: (slug: string, v?: string) =>
    `${BASE}/public/panel/${encodeURIComponent(slug)}/background${v ? `?v=${encodeURIComponent(v)}` : ""}`,
  uploadPanelBgAsset: async (id: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${BASE}/panels/${id}/background`, {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    signalAuthInvalidated(res.status);
    if (!res.ok) throw await iconError(res);
    return res.json() as Promise<PanelDetail>;
  },
  clearPanelBgAsset: (id: string) =>
    request<PanelDetail>(`/panels/${id}/background`, { method: "DELETE" }),
  // Tab icon as an image (alternative to the emoji).
  panelFaviconUrl: (slug: string, v?: string) =>
    `${BASE}/public/panel/${encodeURIComponent(slug)}/favicon${v ? `?v=${encodeURIComponent(v)}` : ""}`,
  uploadPanelFavicon: async (id: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${BASE}/panels/${id}/favicon`, {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    signalAuthInvalidated(res.status);
    if (!res.ok) throw await iconError(res);
    return res.json() as Promise<PanelDetail>;
  },
  clearPanelFavicon: (id: string) =>
    request<PanelDetail>(`/panels/${id}/favicon`, { method: "DELETE" }),

  // panel templates
  listTemplates: () => request<TemplateItem[]>("/panel-templates"),
  createTemplate: (body: CreateTemplateBody) =>
    request<TemplateItem>("/panel-templates", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateTemplate: (id: string, body: UpdateTemplateBody) =>
    request<TemplateItem>(`/panel-templates/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteTemplate: (id: string) =>
    request<void>(`/panel-templates/${id}`, { method: "DELETE" }),

  // public panel view
  getPublicPanel: (slug: string) =>
    request<PublicPanelResponse>(`/public/panel/${encodeURIComponent(slug)}`),
  unlockPublicPanel: (slug: string, password: string) =>
    request<PublicPanelResponse>(`/public/panel/${encodeURIComponent(slug)}`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),

  // admin
  adminListUsers: () => request<AdminUser[]>("/admin/users"),
  adminCreateUser: (body: {
    email: string;
    nickname: string;
    password?: string;
  }) =>
    request<{
      id: string;
      email: string;
      nickname: string;
      role: "user";
      oneTimePassword: string;
    }>("/admin/users", { method: "POST", body: JSON.stringify(body) }),
  adminGetSettings: () => request<AppSettings>("/admin/settings"),
  adminWhoami: () =>
    request<{ ip: string; trusted: boolean }>("/admin/whoami"),
  adminSetSettings: (body: UpdateAppSettingsBody) =>
    request<AppSettings>("/admin/settings", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  adminResetUser2fa: (id: string) =>
    request<{ ok: true }>(`/admin/users/${id}/reset-2fa`, { method: "POST" }),
  adminDeleteUser: (id: string) =>
    request<void>(`/admin/users/${id}`, { method: "DELETE" }),
  adminSetUserRole: (id: string, role: UserRole) =>
    request<{ ok: true }>(`/admin/users/${id}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),
  adminDeleteJobsByStatus: (status: string) =>
    request<{ deleted: number }>(
      `/admin/jobs?status=${encodeURIComponent(status)}`,
      { method: "DELETE" },
    ),
  adminListJobs: (filters?: {
    status?: string;
    type?: string;
    limit?: number;
  }) => {
    const qs = new URLSearchParams(
      Object.entries(filters ?? {}).filter(
        ([, v]) => v !== undefined && v !== "",
      ) as [string, string][],
    ).toString();
    return request<
      Array<{
        id: string;
        type: string;
        status: string;
        attempts: number;
        lastError: string | null;
        availableAt: string;
        startedAt: string | null;
        finishedAt: string | null;
        createdAt: string;
        userId: string;
        userEmail: string;
      }>
    >(`/admin/jobs${qs ? `?${qs}` : ""}`);
  },

  // API access tokens (used by the browser extension, native apps and MCP)
  listApiTokens: () =>
    request<
      Array<{
        id: string;
        label: string;
        lastUsedAt: string | null;
        createdAt: string;
      }>
    >("/extension/tokens"),
  createApiToken: (label: string) =>
    request<{ token: string; label: string }>("/extension/tokens", {
      method: "POST",
      body: JSON.stringify({ label }),
    }),
  revokeApiToken: (id: string) =>
    request<void>(`/extension/tokens/${id}`, { method: "DELETE" }),

  // cloud
  listConnections: () => request<CloudConnection[]>("/cloud/connections"),
  connectSynology: (body: {
    label: string;
    url: string;
    username: string;
    password: string;
    basePath?: string;
    certFingerprint?: string;
  }) =>
    request<{ id: string; provider: "synology_webdav"; label: string }>(
      "/cloud/connect/synology",
      { method: "POST", body: JSON.stringify(body) },
    ),
  inspectCertificate: (url: string) =>
    request<PeerCertificate>("/cloud/inspect-cert", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),
  testSynology: (body: {
    url: string;
    username: string;
    password: string;
    certFingerprint?: string;
  }) =>
    request<{ ok: boolean; message: string }>("/cloud/synology/test", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listSynologyDirs: (body: {
    url: string;
    username: string;
    password: string;
    path: string;
    certFingerprint?: string;
  }) =>
    request<{ entries: Array<{ name: string; path: string }> }>(
      "/cloud/synology/list-dirs",
      { method: "POST", body: JSON.stringify(body) },
    ),
  createSynologyDir: (body: {
    url: string;
    username: string;
    password: string;
    path: string;
    certFingerprint?: string;
  }) =>
    request<{ ok: true }>("/cloud/synology/create-dir", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  startBackup: (id: string) =>
    request<{ jobId: string }>(`/cloud/connections/${id}/backup`, {
      method: "POST",
    }),
  listBackups: (id: string) =>
    request<CloudBackup[]>(`/cloud/connections/${id}/backups`),
  restoreBackup: (id: string, filename: string) =>
    request<{ jobId: string }>(`/cloud/connections/${id}/restore`, {
      method: "POST",
      body: JSON.stringify({ filename }),
    }),
  copyBackup: (id: string, filename: string, targetConnectionId: string) =>
    request<{ ok: true }>(`/cloud/connections/${id}/copy-to`, {
      method: "POST",
      body: JSON.stringify({ filename, targetConnectionId }),
    }),
  setDefaultConnection: (id: string) =>
    request<{ ok: true }>(`/cloud/connections/${id}/default`, {
      method: "PATCH",
    }),
  deleteConnection: (id: string) =>
    request<void>(`/cloud/connections/${id}`, { method: "DELETE" }),
};
