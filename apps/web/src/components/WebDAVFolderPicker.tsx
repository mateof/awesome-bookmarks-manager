import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  FolderClosed,
  FolderPlus,
  Home,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, api } from "../api.js";
import { Modal } from "./Modal.js";

interface Props {
  auth: { url: string; username: string; password: string };
  initialPath?: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}

export function WebDAVFolderPicker({
  auth,
  initialPath = "/",
  onSelect,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const [path, setPath] = useState(normalizePath(initialPath));

  const dirs = useQuery({
    queryKey: ["webdav-dirs", auth.url, auth.username, path],
    queryFn: () => api.listSynologyDirs({ ...auth, path }),
    retry: false,
  });

  const create = useMutation({
    mutationFn: (newPath: string) =>
      api.createSynologyDir({ ...auth, path: newPath }),
    onSuccess: () => dirs.refetch(),
  });

  const errorIsMissing =
    dirs.isError &&
    dirs.error instanceof ApiError &&
    dirs.error.code === "path_missing";

  const segments = path === "/" ? [] : path.split("/").filter(Boolean);

  const navigate = (next: string) => setPath(normalizePath(next));

  const onCreateNew = async () => {
    const name = prompt(t("webdav.promptNewFolder"));
    if (!name) return;
    if (/[/\\]/.test(name)) {
      alert(t("webdav.nameCannotContain"));
      return;
    }
    const newPath = (path === "/" ? "" : path) + "/" + name;
    try {
      await create.mutateAsync(newPath);
      navigate(newPath);
    } catch (e) {
      alert(e instanceof ApiError ? e.message : t("webdav.creatingError"));
    }
  };

  return (
    <Modal title={t("webdav.title")} onClose={onClose} size="lg">
      <div className="space-y-3">
        <Breadcrumbs segments={segments} onJump={navigate} />

        <div className="max-h-80 overflow-auto rounded border border-slate-200 dark:border-slate-700">
          {dirs.isLoading && (
            <div className="flex items-center justify-center p-6 text-sm text-slate-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("webdav.loading")}
            </div>
          )}

          {dirs.isError && (
            <div className="space-y-2 p-3 text-sm">
              <div className="flex items-start gap-2 text-amber-600 dark:text-amber-400">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {dirs.error instanceof ApiError
                    ? dirs.error.message
                    : t("webdav.cannotList")}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {path !== "/" && (
                  <button
                    onClick={() => navigate("/")}
                    className="rounded border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    {t("webdav.backToRoot")}
                  </button>
                )}
                {errorIsMissing && (
                  <button
                    onClick={async () => {
                      try {
                        await create.mutateAsync(path);
                      } catch (e) {
                        alert(
                          e instanceof ApiError ? e.message : t("webdav.creatingError"),
                        );
                      }
                    }}
                    className="rounded bg-slate-900 px-3 py-1 text-xs text-white dark:bg-slate-100 dark:text-slate-900"
                  >
                    {t("webdav.createFolderHere", { path })}
                  </button>
                )}
                <button
                  onClick={() => dirs.refetch()}
                  className="rounded border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  {t("webdav.retry")}
                </button>
              </div>
            </div>
          )}

          {dirs.data && dirs.data.entries.length === 0 && (
            <div className="p-6 text-center text-sm text-slate-400">
              {t("webdav.emptyFolder")}
            </div>
          )}
          {dirs.data?.entries.map((d) => (
            <button
              key={d.path}
              type="button"
              onClick={() => navigate(d.path)}
              className="flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50 last:border-b-0 dark:border-slate-800 dark:hover:bg-slate-800"
            >
              <FolderClosed className="h-4 w-4 text-slate-500" />
              <span className="flex-1 truncate">{d.name}</span>
              <ChevronRight className="h-3 w-3 text-slate-400" />
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onCreateNew}
            className="flex items-center gap-1 rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
            disabled={create.isPending || dirs.isError}
          >
            <FolderPlus className="h-4 w-4" /> {t("webdav.newFolderHere")}
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <code className="rounded bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">
              {path}
            </code>
            <button
              type="button"
              onClick={() => onSelect(path)}
              className="rounded bg-slate-900 px-3 py-1 text-sm text-white dark:bg-slate-100 dark:text-slate-900"
            >
              {t("webdav.select")}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Breadcrumbs({
  segments,
  onJump,
}: {
  segments: string[];
  onJump: (path: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-1 text-sm">
      <button
        type="button"
        onClick={() => onJump("/")}
        className="flex items-center gap-1 rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <Home className="h-3 w-3" /> {t("webdav.root")}
      </button>
      {segments.map((seg, idx) => {
        const upTo = "/" + segments.slice(0, idx + 1).join("/");
        return (
          <span key={upTo} className="flex items-center gap-1">
            <span className="text-slate-300">/</span>
            <button
              type="button"
              onClick={() => onJump(upTo)}
              className="rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {seg}
            </button>
          </span>
        );
      })}
    </div>
  );
}

function normalizePath(p: string): string {
  if (!p || p === "") return "/";
  const out = p.replace(/\/+/g, "/");
  if (out !== "/" && out.endsWith("/")) return out.slice(0, -1);
  return out;
}
