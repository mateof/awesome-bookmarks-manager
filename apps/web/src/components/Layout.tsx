import { useQuery } from "@tanstack/react-query";
import {
  FolderClosed,
  LogOut,
  Menu,
  Search,
  Settings,
  Share2,
  Tag,
  Users,
  X,
} from "lucide-react";
import { LanguageToggle } from "./LanguageToggle.js";
import { ThemeToggle } from "./ThemeToggle.js";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.js";
import { useActiveFolderId } from "../hooks.js";
import { BookmarksBar } from "./BookmarksBar.js";
import { FolderTree } from "./FolderTree.js";

export function Layout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [q, setQ] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const activeFolderId = useActiveFolderId();
  const [scopeOn, setScopeOn] = useState(true);

  // Close drawer on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [loc.pathname]);

  // Reset scope toggle when the active folder context changes — defaults
  // to "scoped" if we're inside a folder, "all" if we're at root.
  useEffect(() => {
    setScopeOn(activeFolderId !== null);
  }, [activeFolderId]);

  const folders = useQuery({
    queryKey: ["folders"],
    queryFn: api.listFolders,
  });
  const bookmarks = useQuery({
    queryKey: ["bookmarks", "all"],
    queryFn: () => api.listBookmarks({}),
  });

  const activeFolderName = useMemo(() => {
    if (!activeFolderId) return null;
    return folders.data?.find((f) => f.id === activeFolderId)?.name ?? null;
  }, [activeFolderId, folders.data]);
  const scopeActive = scopeOn && activeFolderId !== null;

  const sidebarContent = (
    <nav className="space-y-3">
      <div>
        <FolderTree folders={folders.data ?? []} />
      </div>
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
      </div>
    </nav>
  );

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <button
            className="rounded p-1.5 lg:hidden"
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label={t("layout.menu")}
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Link to="/" className="text-base font-semibold sm:text-lg">
            {t("layout.appTitle")}
          </Link>
          <form
            className="ml-auto flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!q.trim()) return;
              const params = new URLSearchParams({ q: q.trim() });
              if (scopeActive && activeFolderId)
                params.set("folderId", activeFolderId);
              nav(`/search?${params.toString()}`);
            }}
          >
            <Search className="h-4 w-4 text-slate-400" />
            <div className="flex items-stretch overflow-hidden rounded border border-slate-300 bg-white text-sm focus-within:border-slate-500 dark:border-slate-700 dark:bg-slate-800">
              {scopeActive && (
                <span className="flex shrink-0 items-center gap-1 border-r border-slate-300 bg-slate-100 px-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-700 dark:text-slate-200">
                  <FolderClosed className="h-3 w-3" />
                  <span className="max-w-[8rem] truncate">
                    {activeFolderName ?? t("layout.folderFallback")}
                  </span>
                  <button
                    type="button"
                    onClick={() => setScopeOn(false)}
                    aria-label={t("layout.scopeRemove")}
                    className="rounded p-0.5 hover:bg-slate-200 dark:hover:bg-slate-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Backspace" &&
                    q.length === 0 &&
                    scopeActive
                  ) {
                    e.preventDefault();
                    setScopeOn(false);
                  }
                }}
                placeholder={
                  scopeActive
                    ? t("layout.searchInFolderPlaceholder")
                    : t("layout.searchPlaceholder")
                }
                className="w-32 bg-transparent px-3 py-1 focus:outline-none sm:w-64"
              />
            </div>
            {!scopeActive && activeFolderId && (
              <button
                type="button"
                onClick={() => setScopeOn(true)}
                title={t("layout.scopeToFolderTitle", {
                  folder: activeFolderName ?? t("layout.folderFallback"),
                })}
                aria-label={t("layout.scopeToFolderAria")}
                className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              >
                <FolderClosed className="h-4 w-4" />
              </button>
            )}
          </form>
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

        {/* Mobile drawer */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <aside
              className="h-full w-72 max-w-[80vw] overflow-auto border-r border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
              onClick={(e) => e.stopPropagation()}
            >
              {sidebarContent}
            </aside>
          </div>
        )}

        <main className="flex-1 overflow-auto p-3 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
