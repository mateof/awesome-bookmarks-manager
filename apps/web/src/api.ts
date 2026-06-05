import type {
  AdminUser,
  Bookmark,
  CloudConnection,
  CreateBookmarkBody,
  CreateFolderBody,
  CreateGroupBody,
  CreateShareBody,
  CreateTagBody,
  Folder,
  Group,
  GroupInvitation,
  GroupMember,
  InviteMemberBody,
  MeResponse,
  Share,
  SharedItem,
  ShareToGroupBody,
  Tag,
  UpdateBookmarkBody,
  UpdateFolderBody,
  UpdateGroupBody,
  UpdateTagBody,
  UserRole,
} from "@awesome-bookmarks/shared";

const BASE = "/api";

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
  login: (identifier: string, password: string) =>
    request<MeResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
    }),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  me: () => request<MeResponse>("/me"),
  updateMyProfile: (body: { nickname?: string; autoSnapshots?: boolean }) =>
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
    fd.append("fetchSnapshots", String(options.fetchSnapshots ?? true));
    if (options.parentId) fd.append("parentId", options.parentId);
    if (options.wrapperFolderName)
      fd.append("wrapperFolderName", options.wrapperFolderName);
    const res = await fetch(`${BASE}/import/html`, {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    if (!res.ok) throw new ApiError(res.status, "import_failed", "Import failed");
    return (await res.json()) as { jobId: string };
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

  // icons (URL helpers — used as <img src=>)
  folderIconUrl: (id: string) => `${BASE}/folders/${id}/icon`,
  bookmarkIconUrl: (id: string) => `${BASE}/bookmarks/${id}/icon`,
  bookmarkSnapshotUrl: (id: string) => `${BASE}/bookmarks/${id}/snapshot.html`,
  bookmarkScreenshotUrl: (id: string) =>
    `${BASE}/bookmarks/${id}/snapshot.png`,
  uploadFolderIcon: async (id: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${BASE}/folders/${id}/icon`, {
      method: "POST",
      credentials: "include",
      body: fd,
    });
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
    if (!res.ok) throw await iconError(res);
    return res.json() as Promise<{ iconBlobPath: string }>;
  },

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
    request<{ id: string; token: string; email: string; expiresAt: string | null }>(
      `/groups/${id}/invitations`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  listMyInvitations: () => request<GroupInvitation[]>("/invitations"),
  acceptInvitation: (token: string) =>
    request<{ groupId: string }>(`/invitations/${encodeURIComponent(token)}/accept`, {
      method: "POST",
    }),
  shareToGroup: (id: string, body: ShareToGroupBody) =>
    request<{ id: string }>(`/groups/${id}/shares`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listGroupShares: (id: string) =>
    request<SharedItem[]>(`/groups/${id}/shares`),
  deleteGroupShare: (groupId: string, shareId: string) =>
    request<void>(`/groups/${groupId}/shares/${shareId}`, { method: "DELETE" }),

  // shared (everything from all my groups)
  listShared: () => request<SharedItem[]>("/shared"),
  getSharedContent: (shareId: string) =>
    request<unknown>(`/shared/${shareId}`),

  // admin
  adminListUsers: () => request<AdminUser[]>("/admin/users"),
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

  // cloud
  listConnections: () => request<CloudConnection[]>("/cloud/connections"),
  connectSynology: (body: {
    label: string;
    url: string;
    username: string;
    password: string;
    basePath?: string;
  }) =>
    request<{ id: string; provider: "synology_webdav"; label: string }>(
      "/cloud/connect/synology",
      { method: "POST", body: JSON.stringify(body) },
    ),
  testSynology: (body: { url: string; username: string; password: string }) =>
    request<{ ok: boolean; message: string }>("/cloud/synology/test", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listSynologyDirs: (body: {
    url: string;
    username: string;
    password: string;
    path: string;
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
  }) =>
    request<{ ok: true }>("/cloud/synology/create-dir", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  startBackup: (id: string) =>
    request<{ jobId: string }>(`/cloud/connections/${id}/backup`, {
      method: "POST",
    }),
  deleteConnection: (id: string) =>
    request<void>(`/cloud/connections/${id}`, { method: "DELETE" }),
};
