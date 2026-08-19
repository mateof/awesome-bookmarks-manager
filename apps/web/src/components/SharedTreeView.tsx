import { ArrowUp, ChevronRight, FolderClosed, PencilLine } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { lookStyle, useLookClass } from "../lib/entityLook.js";
import { CollapsibleRichText } from "./CollapsibleRichText.js";
import { LetterIcon } from "./LetterIcon.js";
import { RichTextView } from "./RichTextView.js";
import { TagChip } from "./TagChip.js";
import type {
  SharedBookmarkPayload,
  SharedFolderPayload,
  SharedPayload,
} from "./SharedNodeEditor.js";

/**
 * The inside of a group share, browsed one folder at a time.
 *
 * Shared by the "Compartidos" detail page and the linked-folder portal, and
 * painted from the same primitives as the owner's own folder view: a folder
 * the owner gave a background, an icon or a tag looks the same to the person
 * they shared it with. The images come from the share's own copies (the
 * owner's blobs need the owner's key), which is why the URLs go through
 * `sharedAssetUrl` instead of the folder/bookmark endpoints.
 */

/** Resolve the folder node reached by walking `path` (node ids) from root. */
function resolvePath(
  root: SharedFolderPayload,
  path: string[],
): { node: SharedFolderPayload; trail: SharedFolderPayload[] } {
  let node = root;
  const trail: SharedFolderPayload[] = [];
  for (const id of path) {
    const next = node.subfolders.find((f) => f.id === id);
    if (!next) break;
    trail.push(next);
    node = next;
  }
  return { node, trail };
}

/**
 * Where you are inside a share, kept in the URL rather than in component
 * state: a refresh (or a shared link, or the browser's back button) used to
 * drop you back at the root of the share, which is not what any other folder
 * view does.
 *
 * Every move is derived from `trail`, not from the raw ids, so a path that no
 * longer resolves (a subfolder the owner moved or deleted since) collapses to
 * the deepest folder that still exists instead of leaving dead ids behind.
 */
export function useSharedPath(root: SharedFolderPayload) {
  const [params, setParams] = useSearchParams();
  const path = (params.get("p") ?? "").split(".").filter(Boolean);
  const { node, trail } = resolvePath(root, path);

  const set = (ids: string[]) => {
    const next = new URLSearchParams(params);
    if (ids.length > 0) next.set("p", ids.join("."));
    else next.delete("p");
    setParams(next);
  };
  const here = () => trail.map((f) => f.id);

  return {
    path,
    node,
    trail,
    inSubfolder: trail.length > 0,
    open: (id: string) => set([...here(), id]),
    goTo: (depth: number) => set(here().slice(0, depth)),
    up: () => set(here().slice(0, -1)),
  };
}

/** Back to the containing folder, matching the owner's view. */
export function UpLevelButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      title={t("folder.upLevel")}
      aria-label={t("folder.upLevel")}
      className="shrink-0 rounded border border-slate-300 p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:hover:bg-slate-800"
    >
      <ArrowUp className="h-4 w-4" />
    </button>
  );
}

/** The drill trail inside a share, as breadcrumb buttons. */
export function SharedTrail({
  trail,
  onGoTo,
}: {
  trail: SharedFolderPayload[];
  onGoTo: (depth: number) => void;
}) {
  return (
    <>
      {trail.map((f, i) => (
        <span key={f.id} className="inline-flex items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5" />
          <button
            type="button"
            onClick={() => onGoTo(i + 1)}
            className="hover:text-slate-900 dark:hover:text-slate-100"
          >
            {f.name}
          </button>
        </span>
      ))}
    </>
  );
}

function SharedTags({ tags }: { tags: SharedPayload["tags"] }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {tags.slice(0, 4).map((tg) => (
        // Tags travel by name; the id is only React's key here, since the
        // owner's tag ids mean nothing in this account.
        <TagChip key={tg.name} tag={{ id: tg.name, ...tg }} size="sm" />
      ))}
      {tags.length > 4 && (
        <span className="text-[10px] text-slate-400">+{tags.length - 4}</span>
      )}
    </div>
  );
}

function CardEdit({ onEdit }: { onEdit: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onEdit();
      }}
      title={t("common.edit")}
      className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
    >
      <PencilLine className="h-4 w-4" />
    </button>
  );
}

function FolderCard({
  shareId,
  folder,
  canEdit,
  onOpen,
  onEdit,
}: {
  shareId: string;
  folder: SharedFolderPayload;
  canEdit: boolean;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const count = folder.subfolders.length + folder.bookmarks.length;
  const look = {
    bgColor: folder.bgColor,
    imageUrl: folder.image
      ? api.sharedAssetUrl(shareId, folder.id, "image", folder.image)
      : null,
    textTone: folder.textTone,
  };
  const tone = useLookClass(look);
  return (
    <div
      style={lookStyle(look)}
      className={`flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900 ${tone}`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        {folder.icon ? (
          <img
            src={api.sharedAssetUrl(shareId, folder.id, "icon", folder.icon)}
            alt=""
            className="h-9 w-9 shrink-0 rounded object-cover"
          />
        ) : (
          <FolderClosed className="h-9 w-9 shrink-0 text-slate-500" />
        )}
        <div className="min-w-0">
          <div className="truncate font-medium">{folder.name}</div>
          <div className="text-xs opacity-70">
            {t("linked.itemCount", { count })}
          </div>
          <SharedTags tags={folder.tags} />
        </div>
      </button>
      {canEdit && <CardEdit onEdit={onEdit} />}
    </div>
  );
}

function BookmarkCard({
  shareId,
  bookmark,
  canEdit,
  onEdit,
}: {
  shareId: string;
  bookmark: SharedBookmarkPayload;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const look = {
    bgColor: bookmark.bgColor,
    imageUrl: bookmark.image
      ? api.sharedAssetUrl(shareId, bookmark.id, "image", bookmark.image)
      : null,
    textTone: bookmark.textTone,
  };
  const tone = useLookClass(look);
  return (
    <div
      style={lookStyle(look)}
      className={`flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900 ${tone}`}
    >
      <a
        href={bookmark.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-w-0 flex-1 items-start gap-3"
      >
        {bookmark.icon ? (
          <img
            src={api.sharedAssetUrl(
              shareId,
              bookmark.id,
              "icon",
              bookmark.icon,
            )}
            alt=""
            className="mt-0.5 h-8 w-8 shrink-0 rounded object-cover"
          />
        ) : (
          <LetterIcon
            label={bookmark.title || bookmark.url}
            seed={bookmark.url || bookmark.title}
            size="mt-0.5 h-8 w-8"
          />
        )}
        <div className="min-w-0">
          <div className="truncate font-medium hover:underline">
            {bookmark.title}
          </div>
          <div className="truncate text-xs opacity-70">{bookmark.url}</div>
          {bookmark.description && (
            <div className="mt-1 text-sm">
              <RichTextView html={bookmark.description} />
            </div>
          )}
          <SharedTags tags={bookmark.tags} />
        </div>
      </a>
      {canEdit && <CardEdit onEdit={onEdit} />}
    </div>
  );
}

/** One folder's worth of a share: its description, subfolders and bookmarks. */
export function SharedFolderBody({
  shareId,
  node,
  canEdit,
  onOpen,
  onEdit,
}: {
  shareId: string;
  node: SharedFolderPayload;
  canEdit: boolean;
  onOpen: (id: string) => void;
  onEdit: (node: SharedPayload) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      {node.description && <CollapsibleRichText html={node.description} />}

      {node.subfolders.length === 0 && node.bookmarks.length === 0 && (
        <div className="text-sm text-slate-400">{t("linked.empty")}</div>
      )}

      {node.subfolders.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {node.subfolders.map((sf) => (
            <FolderCard
              key={sf.id}
              shareId={shareId}
              folder={sf}
              canEdit={canEdit}
              onOpen={() => onOpen(sf.id)}
              onEdit={() => onEdit(sf)}
            />
          ))}
        </div>
      )}

      {node.bookmarks.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {node.bookmarks.map((b) => (
            <BookmarkCard
              key={b.id}
              shareId={shareId}
              bookmark={b}
              canEdit={canEdit}
              onEdit={() => onEdit(b)}
            />
          ))}
        </div>
      )}
    </>
  );
}
