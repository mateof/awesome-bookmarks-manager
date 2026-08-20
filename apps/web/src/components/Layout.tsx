import {
  DndContext,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  Filter,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  Share2,
  Tag,
  Trash2,
  Users,
  X,
} from "lucide-react";
import type { DragData, NestData } from "../dnd.js";
import { LanguageToggle } from "./LanguageToggle.js";
import { ThemeToggle } from "./ThemeToggle.js";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { Notifications } from "./Notifications.js";
import { useAuth } from "../auth.js";
import { BookmarksBar } from "./BookmarksBar.js";
import { FolderTree } from "./FolderTree.js";
import { Footer } from "./Footer.js";
import { Spotlight } from "./Spotlight.js";
import { SwipeToClose } from "./SwipeToClose.js";

/** The folder a dragged shared node currently lives in, as the share sees it. */
function parentOf(a: DragData): string | null {
  return (a.kind === "folder" ? a.parentId : a.folderId) ?? null;
}

interface ShareNode {
  id: string;
  type: "folder" | "bookmark";
  subfolders?: ShareNode[];
  bookmarks?: ShareNode[];
}

function findFolder(node: ShareNode | undefined, id: string): ShareNode | null {
  if (!node || node.type !== "folder") return null;
  if (node.id === id) return node;
  for (const sub of node.subfolders ?? []) {
    const hit = findFolder(sub, id);
    if (hit) return hit;
  }
  return null;
}

/**
 * Where the node it was dropped on sits among its siblings, so the dragged one
 * can take that place. Walks the share payload, because that tree — not this
 * user's own rows — is what the cards were built from.
 */
function indexOfSibling(
  root: unknown,
  overId: string,
  a: DragData,
): number | null {
  const parentId = parentOf(a);
  if (!parentId) return null;
  const holder = findFolder(root as ShareNode | undefined, parentId);
  if (!holder) return null;
  const list = a.kind === "folder" ? holder.subfolders : holder.bookmarks;
  const idx = (list ?? []).findIndex((x) => x.id === overId);
  return idx < 0 ? null : idx;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { user, refresh } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const loc = useLocation();

  // 5px activation constraint so a normal click on a card still fires
  // instead of activating drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Nesting vs reordering: if the pointer is literally within a "nest"
  // droppable (a folder icon or a sidebar entry), that wins → move inside.
  // Otherwise fall back to closest-center among sortable items → reorder.
  const collisionDetection: CollisionDetection = (args) => {
    const within = pointerWithin(args);
    const nest = within.filter((c) => String(c.id).startsWith("nest:"));
    if (nest.length > 0) return nest;
    return closestCenter(args);
  };

  // A drag just ended — the browser will fire a synthetic `click` on
  // whatever is under the pointer (often a bookmark link → opens a tab).
  // Swallow that one click so dropping never triggers navigation.
  const suppressNextClick = () => {
    const handler = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("click", handler, { capture: true, once: true });
    window.setTimeout(
      () => window.removeEventListener("click", handler, { capture: true }),
      350,
    );
  };

  const onDragEnd = async (event: DragEndEvent) => {
    suppressNextClick();
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const a = active.data.current as DragData | undefined;
    const o = over.data.current as (DragData | NestData) | undefined;
    if (!a) return;

    // Resolve an explicit "nest" target: a sidebar folder / Home droppable,
    // or a folder card that a bookmark was dropped onto.
    let nestFolderId: string | null | undefined;
    if (o && "target" in o && o.target === "folder") {
      nestFolderId = o.folderId; // sidebar folder or root
    } else if (o && "kind" in o && o.kind === "folder" && a.kind === "bookmark") {
      nestFolderId = o.id; // bookmark dropped onto a folder card
    }

    // Inside a group share the ids belong to somebody else, so the personal
    // endpoints would 404. Everything routes through the share instead, which
    // also means the move reaches the owner's folder like every other edit
    // there. The share travels in the drag data because this handler sits
    // above every page and cannot ask what is on screen.
    if (a.shareId) {
      await dropInsideShare(a, o, over, nestFolderId);
      return;
    }

    if (nestFolderId !== undefined) {
      if (a.kind === "bookmark") {
        if ((a.folderId ?? null) === nestFolderId) return;
        await api.moveBookmark(a.id, nestFolderId, 0);
        qc.invalidateQueries({ queryKey: ["bookmarks"] });
      } else {
        if (a.id === nestFolderId) return; // can't nest into self
        if ((a.parentId ?? null) === nestFolderId) return; // already there
        try {
          await api.moveFolder(a.id, nestFolderId, 0);
          qc.invalidateQueries({ queryKey: ["folders"] });
        } catch (e) {
          // moveFolder rejects descendant loops; stay quiet in the UI.
          console.warn("moveFolder rejected", e);
        }
      }
      return;
    }

    // Reorder within a sortable list (same kind, over another item).
    if (!o || !("kind" in o) || o.kind !== a.kind) return;

    if (a.kind === "bookmark") {
      const list = qc.getQueryData(["bookmarks", "all"]) as
        | Array<{ id: string; folderId: string | null; position: number }>
        | undefined;
      if (!list) return;
      const folderId = a.folderId ?? null;
      const siblings = list.filter((b) => b.folderId === folderId);
      const overIdx = siblings.findIndex((b) => b.id === o.id);
      if (overIdx < 0) return;
      await api.moveBookmark(a.id, folderId, overIdx);
      qc.invalidateQueries({ queryKey: ["bookmarks"] });
    } else {
      const list = qc.getQueryData(["folders"]) as
        | Array<{ id: string; parentId: string | null; position: number }>
        | undefined;
      if (!list) return;
      const parentId = a.parentId ?? null;
      const siblings = list.filter((f) => f.parentId === parentId);
      const overIdx = siblings.findIndex((f) => f.id === o.id);
      if (overIdx < 0) return;
      await api.moveFolder(a.id, parentId, overIdx);
      qc.invalidateQueries({ queryKey: ["folders"] });
    }
  };
  /**
   * A drop that started on a shared card. Nesting lands it in the target
   * folder; dropping on a sibling puts it at that sibling's index, which is
   * what makes reordering inside a share mean something.
   */
  const dropInsideShare = async (
    a: DragData,
    o: (DragData | NestData) | undefined,
    over: { id: string | number },
    nestFolderId: string | null | undefined,
  ) => {
    if (!a.shareId) return;
    const refresh = () =>
      qc.invalidateQueries({ queryKey: ["shared-content", a.shareId] });
    try {
      if (nestFolderId !== undefined) {
        await api.moveSharedNode(a.shareId, a.id, nestFolderId, undefined, a.shareRev);
        refresh();
        return;
      }
      // Reorder: only among siblings of the same kind, same as your own rows.
      if (!o || !("kind" in o) || o.kind !== a.kind) return;
      const content = qc.getQueryData(["shared-content", a.shareId]) as
        | { content?: unknown }
        | undefined;
      const index = indexOfSibling(content?.content, String(over.id).split(":")[1] ?? "", a);
      if (index === null) return;
      await api.moveSharedNode(
        a.shareId,
        a.id,
        parentOf(a),
        index,
        a.shareRev,
      );
      refresh();
    } catch (e) {
      console.warn("share drop rejected", e);
    }
  };

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [spotlightOpen, setSpotlightOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [loc.pathname]);

  // Cmd/Ctrl+K opens the Spotlight search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSpotlightOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const folders = useQuery({
    queryKey: ["folders"],
    queryFn: api.listFolders,
  });
  const bookmarks = useQuery({
    queryKey: ["bookmarks", "all"],
    queryFn: () => api.listBookmarks({}),
  });
  const invitations = useQuery({
    queryKey: ["invitations"],
    queryFn: api.listMyInvitations,
  });
  const pendingInvites = invitations.data?.length ?? 0;
  const smartFolders = useQuery({
    queryKey: ["smart-folders"],
    queryFn: api.listSmartFolders,
  });
  // Same key prefix as the trash page, so one invalidation refreshes both.
  const trash = useQuery({ queryKey: ["trash", "count"], queryFn: api.trashCount });
  const trashed = trash.data?.count ?? 0;

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 rounded px-2 py-1 text-sm ${
      isActive
        ? "bg-slate-200 dark:bg-slate-800"
        : "hover:bg-slate-100 dark:hover:bg-slate-800"
    }`;

  const sidebarContent = (
    <nav className="space-y-3">
      <div>
        <FolderTree folders={folders.data ?? []} />
      </div>

      {/* Smart folders: saved queries, not containers. They sit right under
          the real tree because that is how they are used. */}
      {(smartFolders.data?.length ?? 0) > 0 && (
        <div className="space-y-0.5 border-t border-slate-200 pt-3 dark:border-slate-800">
          <div className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
            {t("smart.sectionTitle")}
          </div>
          {smartFolders.data?.map((sf) => (
            <NavLink
              key={sf.id}
              to={`/smart/${sf.id}`}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded px-2 py-1 text-sm ${
                  isActive || loc.search.includes(`sf=${sf.id}`)
                    ? "bg-slate-200 dark:bg-slate-800"
                    : "hover:bg-slate-100 dark:hover:bg-slate-800"
                }`
              }
            >
              <Filter className="h-4 w-4 shrink-0" style={{ color: sf.color }} />
              <span className="truncate">{sf.name}</span>
            </NavLink>
          ))}
        </div>
      )}

      <div className="space-y-1 border-t border-slate-200 pt-3 dark:border-slate-800">
        <NavLink
          to="/groups"
          className={({ isActive }) =>
            `flex items-center gap-2 rounded px-2 py-1 text-sm ${
              isActive
                ? "bg-slate-200 dark:bg-slate-800"
                : "hover:bg-slate-100 dark:hover:bg-slate-800"
            }`
          }
        >
          <Users className="h-4 w-4" /> {t("sidebar.groups")}
          {pendingInvites > 0 && (
            <span className="ml-auto rounded-full bg-red-500 px-1.5 text-xs font-medium text-white">
              {pendingInvites}
            </span>
          )}
        </NavLink>
        <NavLink
          to="/tags"
          className={({ isActive }) =>
            `flex items-center gap-2 rounded px-2 py-1 text-sm ${
              isActive
                ? "bg-slate-200 dark:bg-slate-800"
                : "hover:bg-slate-100 dark:hover:bg-slate-800"
            }`
          }
        >
          <Tag className="h-4 w-4" /> {t("sidebar.tags")}
        </NavLink>
        <NavLink
          to="/panels"
          className={({ isActive }) =>
            `flex items-center gap-2 rounded px-2 py-1 text-sm ${
              isActive
                ? "bg-slate-200 dark:bg-slate-800"
                : "hover:bg-slate-100 dark:hover:bg-slate-800"
            }`
          }
        >
          <LayoutDashboard className="h-4 w-4" /> {t("sidebar.panels")}
        </NavLink>
        <NavLink
          to="/shared"
          className={({ isActive }) =>
            `flex items-center gap-2 rounded px-2 py-1 text-sm ${
              isActive
                ? "bg-slate-200 dark:bg-slate-800"
                : "hover:bg-slate-100 dark:hover:bg-slate-800"
            }`
          }
        >
          <Share2 className="h-4 w-4" /> {t("sidebar.shared")}
        </NavLink>
        <NavLink to="/duplicates" className={navClass}>
          <Copy className="h-4 w-4" /> {t("sidebar.duplicates")}
        </NavLink>
        <NavLink to="/trash" className={navClass}>
          <Trash2 className="h-4 w-4" /> {t("sidebar.trash")}
          {trashed > 0 && (
            <span className="ml-auto rounded-full bg-slate-300 px-1.5 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">
              {trashed}
            </span>
          )}
        </NavLink>
      </div>
    </nav>
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragEnd={onDragEnd}
    >
    <div className="flex h-full flex-col overflow-x-hidden">
      <header className="border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex min-w-0 items-center gap-2">
          <button
            className="shrink-0 rounded p-1.5 lg:hidden"
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label={t("layout.menu")}
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Link to="/" className="shrink-0 text-base font-semibold sm:text-lg">
            {t("layout.appTitle")}
          </Link>
          <button
            type="button"
            onClick={() => setSpotlightOpen(true)}
            className="ml-auto flex min-w-0 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-400 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600"
            aria-label={t("layout.searchPlaceholder")}
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="hidden truncate sm:inline sm:w-40 md:w-56">
              {t("layout.searchPlaceholder")}
            </span>
            <kbd className="ml-1 hidden rounded border border-slate-300 px-1.5 text-[10px] text-slate-400 lg:inline dark:border-slate-600">
              ⌘K
            </kbd>
          </button>
          {/* Desktop-only controls; on mobile they live in the full-screen menu */}
          <div className="hidden shrink-0 items-center gap-1 lg:flex">
            <LanguageToggle />
            <ThemeToggle />
            <Link
              to="/settings"
              className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800"
              title={t("layout.settings")}
            >
              <Settings className="h-4 w-4" />
            </Link>
            <button
              onClick={async () => {
                await api.logout();
                refresh();
                nav("/login");
              }}
              className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800"
              title={user?.email ?? t("auth.logout")}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
        {/* Bookmarks bar — overflow-x-auto to scroll on small screens */}
        <BookmarksBar
          folders={folders.data ?? []}
          bookmarks={bookmarks.data ?? []}
        />
      </header>
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <aside className="hidden w-64 shrink-0 overflow-auto border-r border-slate-200 bg-white p-3 lg:block dark:border-slate-800 dark:bg-slate-900">
          {sidebarContent}
        </aside>

        {/* Mobile full-screen menu — slides down from the top; swipe left or tap X to close */}
        {sidebarOpen && (
          <SwipeToClose
            onClose={() => setSidebarOpen(false)}
            className="fixed inset-0 z-30 flex flex-col bg-white lg:hidden dark:bg-slate-900 motion-safe:animate-[sheetDown_.2s_ease-out]"
          >
            <div className="flex items-center gap-1 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <Link to="/" className="flex-1 truncate text-lg font-semibold">
                {t("layout.appTitle")}
              </Link>
              <LanguageToggle />
              <ThemeToggle />
              <Link
                to="/settings"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                title={t("layout.settings")}
              >
                <Settings className="h-5 w-5" />
              </Link>
              <button
                onClick={async () => {
                  await api.logout();
                  refresh();
                  nav("/login");
                }}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                title={user?.email ?? t("auth.logout")}
              >
                <LogOut className="h-5 w-5" />
              </button>
              <button
                onClick={() => setSidebarOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label={t("layout.menu")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 text-[15px] [&_a]:py-2">
              {sidebarContent}
            </div>
          </SwipeToClose>
        )}

        <main className="flex flex-1 flex-col overflow-auto p-3 sm:p-6">
          <div className="flex-1">{children}</div>
          <Footer />
        </main>
      </div>
      {spotlightOpen && <Spotlight onClose={() => setSpotlightOpen(false)} />}
      <Notifications />
    </div>
    </DndContext>
  );
}
