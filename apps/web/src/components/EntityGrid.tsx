import type { Bookmark, Folder, Tag } from "@awesome-bookmarks/shared";
import {
  SortableContext,
  rectSortingStrategy,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  Copy,
  ExternalLink,
  FolderClosed,
  GripVertical,
  Link2,
  Share2,
} from "lucide-react";
import { createContext, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import {
  BOOKMARK_SORTABLE_IDS,
  FOLDER_SORTABLE_IDS,
  type SortableResult,
  useBookmarkSortable,
  useFolderSortable,
  useNestDrop,
} from "../dnd.js";
import { lookStyle, useLookClass, type EntityLook } from "../lib/entityLook.js";
import type { ViewMode } from "../view-mode.js";
import { CopyButton } from "./CopyButton.js";
import { FavoriteToggle } from "./FavoriteToggle.js";
import { KebabMenu, type KebabItem } from "./KebabMenu.js";
import { LetterIcon } from "./LetterIcon.js";
import { TagChipList } from "./TagChip.js";

/**
 * The folder/bookmark grid: five view modes, selection, drag and drop, the
 * per-card kebab.
 *
 * It lives here rather than inside FolderPage because a shared folder someone
 * gave you editor access to should not look like a lesser version of your own.
 * It used to, and the reason was not that the layout could not be shared: it
 * was that four things inside these cards spoke straight to the personal API —
 * the icon URL, the background URL, the favourite star and the drag and drop.
 * Those four are now supplied by an `EntitySource`, and everything else is the
 * same component in both places.
 */

/** What differs between "these are my rows" and "these came out of a share". */
export interface EntitySource {
  /** The card's icon, or null for the default one. */
  folderIconUrl: (f: Folder) => string | null;
  bookmarkIconUrl: (b: Bookmark) => string | null;
  folderBgUrl: (f: Folder) => string | null;
  bookmarkBgUrl: (b: Bookmark) => string | null;
  /** Whether the star is offered at all. */
  canFavorite: boolean;
  /** Where a star goes when it is not this user's own row (a share). */
  onToggleFavorite?: (
    kind: "folder" | "bookmark",
    id: string,
    next: boolean,
  ) => Promise<void>;
  /**
   * Set inside a group share. It rides along in the drag data so the drop
   * handler in Layout knows to move the node inside the share instead of
   * calling the personal endpoints with ids this user does not own.
   */
  shareId?: string;
  /** The share's rev, for the concurrency check on a drop. */
  shareRev?: number;
  /** Drag and drop reorders the owner's rows, which a member cannot do. */
  canDrag: boolean;
  /** Tag chips link to your own tag filter. A share's tags travel by name and
   * are not rows in your account, so there is nowhere for them to lead. */
  canLinkTags: boolean;
}

/** Your own library: everything is available and the assets are your own. */
export const PERSONAL_SOURCE: EntitySource = {
  folderIconUrl: (f) =>
    f.iconBlobPath ? api.folderIconUrl(f.aliasOf ?? f.id, f.updatedAt) : null,
  bookmarkIconUrl: (b) =>
    b.iconBlobPath ? api.bookmarkIconUrl(b.aliasOf ?? b.id, b.updatedAt) : null,
  folderBgUrl: (f) =>
    f.imageBlobPath ? api.folderBgImageUrl(f.id, f.updatedAt) : null,
  bookmarkBgUrl: (b) =>
    b.imageBlobPath
      ? api.bookmarkBgImageUrl(b.aliasOf ?? b.id, b.updatedAt)
      : null,
  canFavorite: true,
  canDrag: true,
  canLinkTags: true,
};

/** The share coordinates a drag has to carry, or nothing for your own rows. */
function shareDrag(src: EntitySource) {
  return src.shareId !== undefined && src.shareRev !== undefined
    ? { shareId: src.shareId, rev: src.shareRev }
    : undefined;
}

const SourceContext = createContext<EntitySource>(PERSONAL_SOURCE);
export const useEntitySource = () => useContext(SourceContext);

export function EntitySourceProvider({
  source,
  children,
}: {
  source: EntitySource;
  children: React.ReactNode;
}) {
  return (
    <SourceContext.Provider value={source}>{children}</SourceContext.Provider>
  );
}

export type SelectionKey = `folder:${string}` | `bookmark:${string}`;

function useRelativeTime() {
  const { i18n } = useTranslation();
  const rtf = new Intl.RelativeTimeFormat(i18n.resolvedLanguage ?? "es", {
    numeric: "auto",
  });
  return (iso: string): string => {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return "";
    const diffSec = (t - Date.now()) / 1000;
    const abs = Math.abs(diffSec);
    if (abs < 60) return rtf.format(Math.round(diffSec), "second");
    if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
    if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
    if (abs < 2592000) return rtf.format(Math.round(diffSec / 86400), "day");
    if (abs < 31536000) return rtf.format(Math.round(diffSec / 2592000), "month");
    return rtf.format(Math.round(diffSec / 31536000), "year");
  };
}

function stripTags(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

export interface BodyProps {
  mode: ViewMode;
  subfolders: Folder[];
  items: Bookmark[];
  allTags: Tag[];
  selection: Set<SelectionKey>;
  toggle: (k: SelectionKey) => void;
  countDirectItems: (id: string) => number;
  folderKebab: (f: Folder) => KebabItem[];
  bookmarkKebab: (b: Bookmark) => KebabItem[];
  onNavFolder: (id: string) => void;
}

export function Body(p: BodyProps) {
  const { t } = useTranslation();
  if (p.mode === "table") return <TableLayout {...p} />;
  return (
    <>
      {p.subfolders.length > 0 && (
        <Section title={t("folder.foldersSection")}>
          <FoldersBlock {...p} />
        </Section>
      )}
      <Section title={t("folder.bookmarksSection")}>
        {p.items.length > 0 ? (
          <BookmarksBlock {...p} />
        ) : (
          <div className="text-sm text-slate-400">{t("folder.noBookmarksHere")}</div>
        )}
      </Section>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-medium uppercase text-slate-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

function FoldersBlock(p: BodyProps) {
  const ids = FOLDER_SORTABLE_IDS(p.subfolders);
  const inner = (() => {
    switch (p.mode) {
      case "list":
        return (
          <div className="divide-y divide-slate-200 rounded border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {p.subfolders.map((sf) => (
              <FolderListRow key={sf.id} sf={sf} p={p} />
            ))}
          </div>
        );
      case "large":
        return (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {p.subfolders.map((sf) => (
              <FolderLargeCard key={sf.id} sf={sf} p={p} />
            ))}
          </div>
        );
      case "mosaic":
        return (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
            {p.subfolders.map((sf) => (
              <FolderMosaicCard key={sf.id} sf={sf} p={p} />
            ))}
          </div>
        );
      case "grid":
      default:
        return (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {p.subfolders.map((sf) => (
              <FolderGridCard key={sf.id} sf={sf} p={p} />
            ))}
          </div>
        );
    }
  })();
  return (
    <SortableContext items={ids} strategy={rectSortingStrategy}>
      {inner}
    </SortableContext>
  );
}

function BookmarksBlock(p: BodyProps) {
  const ids = BOOKMARK_SORTABLE_IDS(p.items);
  const inner = (() => {
    switch (p.mode) {
      case "list":
        return (
          <div className="divide-y divide-slate-200 rounded border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {p.items.map((b) => (
              <BookmarkListRow key={b.id} b={b} p={p} />
            ))}
          </div>
        );
      case "large":
        return (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {p.items.map((b) => (
              <BookmarkLargeCard key={b.id} b={b} p={p} />
            ))}
          </div>
        );
      case "mosaic":
        return (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
            {p.items.map((b) => (
              <BookmarkMosaicCard key={b.id} b={b} p={p} />
            ))}
          </div>
        );
      case "grid":
      default:
        return (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
            {p.items.map((b) => (
              <BookmarkGridCard key={b.id} b={b} p={p} />
            ))}
          </div>
        );
    }
  })();
  return (
    <SortableContext items={ids} strategy={rectSortingStrategy}>
      {inner}
    </SortableContext>
  );
}

/** The snapshot state as interface text. "none" is the common case and says
 * nothing worth a word, so it reads as a dash. */
function SnapshotStatus({ status }: { status: string }) {
  const { t } = useTranslation();
  if (status === "none") return <span className="text-slate-400">—</span>;
  return <>{t(`table.snapshot_${status}` as "table.snapshot_ready")}</>;
}

function stopBubble(e: React.MouseEvent | React.KeyboardEvent) {
  e.stopPropagation();
}



// The painting itself lives in lib/entityLook so the shared views (which read
// the same look out of a group share's payload) cannot drift from this one.
function useFolderLook(f: Folder): EntityLook {
  const src = useEntitySource();
  return { bgColor: f.bgColor, imageUrl: src.folderBgUrl(f), textTone: f.textTone };
}

function useBookmarkLook(b: Bookmark): EntityLook {
  const src = useEntitySource();
  return {
    bgColor: b.bgColor,
    imageUrl: src.bookmarkBgUrl(b),
    textTone: b.textTone,
  };
}

function useFolderBgStyle(f: Folder): React.CSSProperties {
  return lookStyle(useFolderLook(f));
}

function useBookmarkBgStyle(b: Bookmark): React.CSSProperties {
  return lookStyle(useBookmarkLook(b));
}

function useFolderContrast(f: Folder): string {
  return useLookClass(useFolderLook(f));
}

function useBookmarkContrast(b: Bookmark): string {
  return useLookClass(useBookmarkLook(b));
}

function FolderIcon({ sf, size }: { sf: Folder; size: string }) {
  const iconUrl = useEntitySource().folderIconUrl(sf);
  const inner = iconUrl ? (
    <img
      src={iconUrl}
      alt=""
      className={`${size} rounded object-cover`}
    />
  ) : (
    <FolderClosed className={`${size} text-slate-500`} />
  );
  if (!sf.aliasOf) return inner;
  return <AliasBadge>{inner}</AliasBadge>;
}

/** Marks a card as a symlink to the real folder/bookmark. */
function AliasBadge({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <span className="relative inline-flex">
      {children}
      <span
        title={t("folder.aliasBadge")}
        className="absolute -bottom-1 -right-1 rounded-full bg-slate-700 p-0.5 text-white ring-2 ring-white dark:ring-slate-900"
      >
        <Link2 className="h-2 w-2" />
      </span>
    </span>
  );
}

/**
 * The folder icon doubles as a "drop inside" target. Dropping a dragged
 * folder/bookmark on the icon nests it into this folder; dropping elsewhere
 * on the card reorders. A ring highlights the icon while it's the target.
 */
function FolderNestZone({ sf, size }: { sf: Folder; size: string }) {
  const { t } = useTranslation();
  const src = useEntitySource();
  const nest = useNestDrop(sf.id, "card", src.shareId);
  return (
    <span
      ref={nest.ref}
      title={t("folder.dropToNest")}
      className={`relative inline-flex rounded-lg p-1 transition ${
        nest.isOver ? "bg-blue-500/20 ring-2 ring-inset ring-blue-500" : ""
      }`}
    >
      <FolderIcon sf={sf} size={size} />
      {sf.shareOrigin && (
        <span
          title={t("folder.sharedFrom", { group: sf.shareOrigin })}
          className="absolute -bottom-1 -right-1 rounded-full bg-blue-500 p-0.5 text-white ring-2 ring-white dark:ring-slate-900"
        >
          <Share2 className="h-2.5 w-2.5" />
        </span>
      )}
    </span>
  );
}

function BookmarkIcon({ b, size }: { b: Bookmark; size: string }) {
  const { t } = useTranslation();
  const iconUrl = useEntitySource().bookmarkIconUrl(b);
  const inner = iconUrl ? (
    <img
      src={iconUrl}
      alt=""
      className={`${size} shrink-0 rounded object-cover`}
    />
  ) : (
    <LetterIcon label={b.title || b.url} seed={b.url || b.title} size={size} />
  );
  if (b.aliasOf) {
    return (
      <span className="relative inline-flex">
        {inner}
        <span
          title={t("folder.aliasBadge")}
          className="absolute -bottom-1 -right-1 rounded-full bg-slate-700 p-0.5 text-white ring-2 ring-white dark:ring-slate-900"
        >
          <Link2 className="h-2 w-2" />
        </span>
      </span>
    );
  }
  if (!b.shareOrigin) return inner;
  return (
    <span className="relative inline-flex">
      {inner}
      <span
        title={t("folder.sharedFrom", { group: b.shareOrigin })}
        className="absolute -bottom-1 -right-1 rounded-full bg-blue-500 p-0.5 text-white ring-2 ring-white dark:ring-slate-900"
      >
        <Share2 className="h-2 w-2" />
      </span>
    </span>
  );
}

function HoverCheckbox({
  selected,
  onToggle,
  label,
  className = "",
  alwaysVisible = false,
}: {
  selected: boolean;
  onToggle: () => void;
  label: string;
  className?: string;
  alwaysVisible?: boolean;
}) {
  const visibility =
    alwaysVisible || selected
      ? "opacity-100"
      : // Always shown on touch (no hover); hover-revealed on desktop.
        "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100";
  return (
    <input
      type="checkbox"
      checked={selected}
      onChange={onToggle}
      onClick={stopBubble}
      aria-label={label}
      className={`h-4 w-4 accent-slate-700 transition-opacity ${visibility} ${className}`}
    />
  );
}

// `t` typed as any to sidestep TS2589 (deep i18next resource instantiation).
function selectFolderLabel(t: any, name: string) {
  return `${t("common.selectFolder")} ${name}`;
}
function selectBookmarkLabel(t: any, title: string) {
  return `${t("common.selectBookmark")} ${title}`;
}

/**
 * Grip that reorders a card. Only this button carries the drag listeners (with
 * touch-action: none), so the rest of the card stays clickable and the list
 * still scrolls on touch — the same pattern the table rows use, which is what
 * makes reordering work on mobile.
 */
function CardDragHandle({ drag }: { drag: SortableResult }) {
  const { t } = useTranslation();
  return (
    <button
      ref={drag.setActivatorNodeRef}
      type="button"
      aria-label={t("table.dragHandle")}
      title={t("table.dragHandle")}
      {...drag.attributes}
      {...drag.listeners}
      onClick={stopBubble}
      className="shrink-0 cursor-grab touch-none rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing dark:hover:bg-slate-800 dark:hover:text-slate-200"
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
}

function FolderGridCard({ sf, p }: { sf: Folder; p: BodyProps }) {
  const src = useEntitySource();
  const { t } = useTranslation();
  const drag = useFolderSortable(sf, shareDrag(src));
  const contrast = useFolderContrast(sf);
  const key: SelectionKey = `folder:${sf.id}`;
  const selected = p.selection.has(key);
  return (
    <div
      ref={drag.ref}      role="link"
      tabIndex={0}
      onClick={() => p.onNavFolder(sf.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") p.onNavFolder(sf.id);
      }}
      style={{ ...drag.style, ...useFolderBgStyle(sf) }}
      className={`group relative flex cursor-pointer flex-col items-center gap-2 rounded border border-slate-200 bg-white p-3 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800 ${contrast}`}
    >
      <HoverCheckbox
        selected={selected}
        onToggle={() => p.toggle(key)}
        label={selectFolderLabel(t, sf.name)}
        className="absolute left-1 top-1 z-10"
      />
      <div
        className={`absolute right-1 top-1 z-10 flex items-center gap-0.5 transition-opacity ${
          selected || sf.favorite
            ? "opacity-100"
            : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
        }`}
      >
        {src.canDrag && <CardDragHandle drag={drag} />}
        {src.canFavorite && (
          <FavoriteToggle
            folder={sf}
            {...(src.onToggleFavorite ? { onToggle: src.onToggleFavorite } : {})}
          />
        )}
        <KebabMenu items={p.folderKebab(sf)} />
      </div>
      <FolderNestZone sf={sf} size="h-8 w-8" />
      <div className="w-full truncate text-center text-sm">{sf.name}</div>
      {(sf.tagIds?.length ?? 0) > 0 && (
        <div className="flex w-full justify-center">
          <TagChipList
            tagIds={sf.tagIds ?? []}
            allTags={p.allTags}
            size="sm"
            asLink={src.canLinkTags}
            max={3}
          />
        </div>
      )}
    </div>
  );
}

function FolderListRow({ sf, p }: { sf: Folder; p: BodyProps }) {
  const src = useEntitySource();
  const { t } = useTranslation();
  const drag = useFolderSortable(sf, shareDrag(src));
  const contrast = useFolderContrast(sf);
  const key: SelectionKey = `folder:${sf.id}`;
  const selected = p.selection.has(key);
  const count = p.countDirectItems(sf.id);
  return (
    <div
      ref={drag.ref}      role="link"
      tabIndex={0}
      onClick={() => p.onNavFolder(sf.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") p.onNavFolder(sf.id);
      }}
      style={{ ...drag.style, ...useFolderBgStyle(sf) }}
      className={`group flex cursor-pointer items-center gap-3 bg-white px-3 py-2 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 ${contrast}`}
    >
      <HoverCheckbox
        selected={selected}
        onToggle={() => p.toggle(key)}
        label={selectFolderLabel(t, sf.name)}
      />
      <FolderNestZone sf={sf} size="h-5 w-5" />
      <div className="flex-1 truncate text-sm">{sf.name}</div>
      <TagChipList
        tagIds={sf.tagIds ?? []}
        allTags={p.allTags}
        size="sm"
        asLink={src.canLinkTags}
        max={3}
      />
      <div className="text-xs text-slate-500">
        {t("folder.itemsCount", { count })}
      </div>
      {src.canDrag && <CardDragHandle drag={drag} />}
      {src.canFavorite && (
          <FavoriteToggle
            folder={sf}
            {...(src.onToggleFavorite ? { onToggle: src.onToggleFavorite } : {})}
          />
        )}
      <KebabMenu items={p.folderKebab(sf)} />
    </div>
  );
}

function FolderLargeCard({ sf, p }: { sf: Folder; p: BodyProps }) {
  const src = useEntitySource();
  const { t } = useTranslation();
  const drag = useFolderSortable(sf, shareDrag(src));
  const contrast = useFolderContrast(sf);
  const key: SelectionKey = `folder:${sf.id}`;
  const selected = p.selection.has(key);
  const desc = stripTags(sf.description);
  const count = p.countDirectItems(sf.id);
  return (
    <div
      ref={drag.ref}      role="link"
      tabIndex={0}
      onClick={() => p.onNavFolder(sf.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") p.onNavFolder(sf.id);
      }}
      style={{ ...drag.style, ...useFolderBgStyle(sf) }}
      className={`group relative flex min-h-[8rem] cursor-pointer flex-col rounded border border-slate-200 bg-white p-4 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800 ${contrast}`}
    >
      <div className="flex items-center gap-3">
        <HoverCheckbox
          selected={selected}
          onToggle={() => p.toggle(key)}
          label={selectFolderLabel(t, sf.name)}
          className="shrink-0"
        />
        <FolderNestZone sf={sf} size="h-10 w-10" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{sf.name}</div>
          <div className="text-xs text-slate-500">
            {t("folder.itemsCount", { count })}
          </div>
        </div>
        <div
          className={`flex shrink-0 items-center gap-0.5 transition-opacity ${
            selected || sf.favorite
              ? "opacity-100"
              : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
          }`}
        >
          {src.canDrag && <CardDragHandle drag={drag} />}
          {src.canFavorite && (
          <FavoriteToggle
            folder={sf}
            {...(src.onToggleFavorite ? { onToggle: src.onToggleFavorite } : {})}
          />
        )}
          <KebabMenu items={p.folderKebab(sf)} />
        </div>
      </div>
      {desc && (
        <div className="mt-2 line-clamp-3 text-sm text-slate-600 dark:text-slate-300">
          {desc}
        </div>
      )}
      {(sf.tagIds?.length ?? 0) > 0 && (
        <div className="mt-2">
          <TagChipList
            tagIds={sf.tagIds ?? []}
            allTags={p.allTags}
            size="sm"
            asLink={src.canLinkTags}
          />
        </div>
      )}
    </div>
  );
}

function FolderMosaicCard({ sf, p }: { sf: Folder; p: BodyProps }) {
  const src = useEntitySource();
  const { t } = useTranslation();
  const drag = useFolderSortable(sf, shareDrag(src));
  const contrast = useFolderContrast(sf);
  const key: SelectionKey = `folder:${sf.id}`;
  const selected = p.selection.has(key);
  return (
    <div
      ref={drag.ref}      role="link"
      tabIndex={0}
      onClick={() => p.onNavFolder(sf.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") p.onNavFolder(sf.id);
      }}
      style={{ ...drag.style, ...useFolderBgStyle(sf) }}
      className={`group relative flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded border border-slate-200 bg-white p-2 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800 ${contrast}`}
    >
      <HoverCheckbox
        selected={selected}
        onToggle={() => p.toggle(key)}
        label={selectFolderLabel(t, sf.name)}
        className="absolute left-1 top-1 z-10"
      />
      <div
        className={`absolute right-1 top-1 z-10 flex items-center gap-0.5 transition-opacity ${
          selected || sf.favorite
            ? "opacity-100"
            : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
        }`}
      >
        {src.canDrag && <CardDragHandle drag={drag} />}
        {src.canFavorite && (
          <FavoriteToggle
            folder={sf}
            {...(src.onToggleFavorite ? { onToggle: src.onToggleFavorite } : {})}
          />
        )}
        <KebabMenu items={p.folderKebab(sf)} />
      </div>
      <FolderNestZone sf={sf} size="h-10 w-10" />
      <div className="w-full truncate text-center text-xs">{sf.name}</div>
      {(sf.tagIds?.length ?? 0) > 0 && (
        <TagChipList
          tagIds={sf.tagIds ?? []}
          allTags={p.allTags}
          asDot
        />
      )}
    </div>
  );
}

function BookmarkGridCard({ b, p }: { b: Bookmark; p: BodyProps }) {
  const src = useEntitySource();
  const { t } = useTranslation();
  const drag = useBookmarkSortable(b, shareDrag(src));
  const contrast = useBookmarkContrast(b);
  const key: SelectionKey = `bookmark:${b.id}`;
  const selected = p.selection.has(key);
  return (
    <div
      ref={drag.ref}      style={{ ...drag.style, ...useBookmarkBgStyle(b) }}
      className={`group relative flex items-start gap-2 rounded border border-slate-200 bg-white p-3 pl-7 dark:border-slate-800 dark:bg-slate-900 ${contrast}`}
    >
      <HoverCheckbox
        selected={selected}
        onToggle={() => p.toggle(key)}
        label={selectBookmarkLabel(t, b.title)}
        className="absolute left-2 top-3 z-10"
      />
      <BookmarkIcon b={b} size="h-8 w-8" />
      <div className="flex-1 overflow-hidden">
        <Link
          to={`/bookmark/${b.id}`}
          className="block truncate text-sm font-medium hover:underline"
        >
          {b.title}
        </Link>
        <div className="flex items-center gap-1">
          <a
            href={b.url}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 flex-1 truncate text-xs text-slate-500 hover:underline"
          >
            {b.url}
          </a>
          <CopyButton text={b.url} title={t("bookmark.copyUrl")} />
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide text-slate-400">
            <SnapshotStatus status={b.snapshotStatus} />
          </span>
          <TagChipList
            tagIds={b.tagIds ?? []}
            allTags={p.allTags}
            size="sm"
            asLink={src.canLinkTags}
            max={3}
          />
        </div>
      </div>
      <a
        href={b.url}
        target="_blank"
        rel="noopener noreferrer"
        title={t("bookmark.openUrlTitle")}
        className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
      >
        <ExternalLink className="h-4 w-4" />
      </a>
      {src.canFavorite && (
          <FavoriteToggle
            bookmark={b}
            {...(src.onToggleFavorite ? { onToggle: src.onToggleFavorite } : {})}
          />
        )}
      {src.canDrag && <CardDragHandle drag={drag} />}
      <KebabMenu items={p.bookmarkKebab(b)} />
    </div>
  );
}

function BookmarkListRow({ b, p }: { b: Bookmark; p: BodyProps }) {
  const src = useEntitySource();
  const { t } = useTranslation();
  const drag = useBookmarkSortable(b, shareDrag(src));
  const contrast = useBookmarkContrast(b);
  const key: SelectionKey = `bookmark:${b.id}`;
  const selected = p.selection.has(key);
  return (
    <div
      ref={drag.ref}      style={{ ...drag.style, ...useBookmarkBgStyle(b) }}
      className={`group flex items-center gap-3 bg-white px-3 py-2 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 ${contrast}`}
    >
      <HoverCheckbox
        selected={selected}
        onToggle={() => p.toggle(key)}
        label={selectBookmarkLabel(t, b.title)}
      />
      <BookmarkIcon b={b} size="h-5 w-5" />
      <Link
        to={`/bookmark/${b.id}`}
        className="truncate text-sm font-medium hover:underline"
      >
        {b.title}
      </Link>
      <a
        href={b.url}
        target="_blank"
        rel="noopener noreferrer"
        className="hidden flex-1 truncate text-xs text-slate-500 hover:underline sm:block"
      >
        {b.url}
      </a>
      <CopyButton
        text={b.url}
        title={t("bookmark.copyUrl")}
        className="hidden shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900 sm:inline-flex dark:hover:bg-slate-800 dark:hover:text-slate-100"
      />
      <TagChipList
        tagIds={b.tagIds ?? []}
        allTags={p.allTags}
        size="sm"
        asLink={src.canLinkTags}
        max={3}
      />
      <span className="hidden text-[10px] uppercase tracking-wide text-slate-400 lg:inline">
        <SnapshotStatus status={b.snapshotStatus} />
      </span>
      <a
        href={b.url}
        target="_blank"
        rel="noopener noreferrer"
        title={t("bookmark.openUrlTitle")}
        className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
      >
        <ExternalLink className="h-4 w-4" />
      </a>
      {src.canFavorite && (
          <FavoriteToggle
            bookmark={b}
            {...(src.onToggleFavorite ? { onToggle: src.onToggleFavorite } : {})}
          />
        )}
      {src.canDrag && <CardDragHandle drag={drag} />}
      <KebabMenu items={p.bookmarkKebab(b)} />
    </div>
  );
}

function BookmarkLargeCard({ b, p }: { b: Bookmark; p: BodyProps }) {
  const src = useEntitySource();
  const { t } = useTranslation();
  const drag = useBookmarkSortable(b, shareDrag(src));
  const contrast = useBookmarkContrast(b);
  const key: SelectionKey = `bookmark:${b.id}`;
  const selected = p.selection.has(key);
  const desc = stripTags(b.description);
  return (
    <div
      ref={drag.ref}      style={{ ...drag.style, ...useBookmarkBgStyle(b) }}
      className={`group relative flex flex-col overflow-hidden rounded border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 ${contrast}`}
    >
      <div className="flex flex-col gap-1 p-3">
        <div className="flex items-center gap-2">
          <HoverCheckbox
            selected={selected}
            onToggle={() => p.toggle(key)}
            label={selectBookmarkLabel(t, b.title)}
            className="shrink-0"
          />
          <BookmarkIcon b={b} size="h-5 w-5" />
          <Link
            to={`/bookmark/${b.id}`}
            className="flex-1 truncate text-sm font-medium hover:underline"
          >
            {b.title}
          </Link>
          <a
            href={b.url}
            target="_blank"
            rel="noopener noreferrer"
            title={t("bookmark.openUrlTitle")}
            className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          <div
            className={`flex shrink-0 items-center gap-0.5 transition-opacity ${
              selected || b.favorite
                ? "opacity-100"
                : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
            }`}
          >
            {src.canFavorite && (
          <FavoriteToggle
            bookmark={b}
            {...(src.onToggleFavorite ? { onToggle: src.onToggleFavorite } : {})}
          />
        )}
            {src.canDrag && <CardDragHandle drag={drag} />}
            <KebabMenu items={p.bookmarkKebab(b)} />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <a
            href={b.url}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 flex-1 truncate text-xs text-slate-500 hover:underline"
          >
            {b.url}
          </a>
          <CopyButton text={b.url} title={t("bookmark.copyUrl")} />
        </div>
        {desc && (
          <div className="line-clamp-2 text-sm text-slate-600 dark:text-slate-300">
            {desc}
          </div>
        )}
        {(b.tagIds?.length ?? 0) > 0 && (
          <div className="mt-1">
            <TagChipList
              tagIds={b.tagIds ?? []}
              allTags={p.allTags}
              size="sm"
              asLink={src.canLinkTags}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function BookmarkMosaicCard({ b, p }: { b: Bookmark; p: BodyProps }) {
  const src = useEntitySource();
  const { t } = useTranslation();
  const drag = useBookmarkSortable(b, shareDrag(src));
  const contrast = useBookmarkContrast(b);
  const key: SelectionKey = `bookmark:${b.id}`;
  const selected = p.selection.has(key);
  return (
    <div
      ref={drag.ref}      style={{ ...drag.style, ...useBookmarkBgStyle(b) }}
      className={`group relative flex aspect-square flex-col items-center justify-center gap-1 rounded border border-slate-200 bg-white p-2 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800 ${contrast}`}
    >
      <HoverCheckbox
        selected={selected}
        onToggle={() => p.toggle(key)}
        label={selectBookmarkLabel(t, b.title)}
        className="absolute left-1 top-1 z-10"
      />
      <div
        className={`absolute right-1 top-1 z-10 flex items-center gap-0.5 transition-opacity ${
          selected || b.favorite
            ? "opacity-100"
            : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
        }`}
      >
        {src.canFavorite && (
          <FavoriteToggle
            bookmark={b}
            {...(src.onToggleFavorite ? { onToggle: src.onToggleFavorite } : {})}
          />
        )}
        {src.canDrag && <CardDragHandle drag={drag} />}
        <KebabMenu items={p.bookmarkKebab(b)} />
      </div>
      <a
        href={b.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-1 flex-col items-center justify-center gap-1"
      >
        <BookmarkIcon b={b} size="h-10 w-10" />
      </a>
      <Link
        to={`/bookmark/${b.id}`}
        className="w-full truncate text-center text-xs hover:underline"
      >
        {b.title}
      </Link>
      {(b.tagIds?.length ?? 0) > 0 && (
        <TagChipList tagIds={b.tagIds ?? []} allTags={p.allTags} asDot />
      )}
    </div>
  );
}

function TableLayout(p: BodyProps) {
  const { t } = useTranslation();
  if (p.subfolders.length === 0 && p.items.length === 0) {
    return <div className="text-sm text-slate-400">{t("folder.noItemsHere")}</div>;
  }
  const folderIds = FOLDER_SORTABLE_IDS(p.subfolders);
  const bookmarkIds = BOOKMARK_SORTABLE_IDS(p.items);
  return (
    <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-800">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800">
          <tr>
            <th className="w-6 px-1 py-2"></th>
            <th className="w-8 px-2 py-2"></th>
            <th className="w-8 px-2 py-2"></th>
            <th className="px-2 py-2 text-left">{t("table.title")}</th>
            <th className="px-2 py-2 text-left">{t("table.url")}</th>
            <th className="px-2 py-2 text-left">{t("table.tags")}</th>
            <th className="px-2 py-2 text-left">{t("table.info")}</th>
            <th className="px-2 py-2 text-left">{t("table.added")}</th>
            <th className="w-20 px-2 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
          <SortableContext items={folderIds} strategy={verticalListSortingStrategy}>
            {p.subfolders.map((sf) => (
              <TableFolderRow key={`f-${sf.id}`} sf={sf} p={p} />
            ))}
          </SortableContext>
          <SortableContext
            items={bookmarkIds}
            strategy={verticalListSortingStrategy}
          >
            {p.items.map((b) => (
              <TableBookmarkRow key={`b-${b.id}`} b={b} p={p} />
            ))}
          </SortableContext>
        </tbody>
      </table>
    </div>
  );
}

/** Drag-handle cell for a sortable table row. Carries the dnd-kit activator so
 * links/checkboxes elsewhere in the row stay clickable. */
function DragHandleCell({
  setRef,
  handleProps,
}: {
  setRef: (n: HTMLElement | null) => void;
  handleProps: Record<string, unknown>;
}) {
  const { t } = useTranslation();
  return (
    <td className="px-1 py-2" onClick={stopBubble}>
      <button
        ref={setRef}
        type="button"
        aria-label={t("table.dragHandle")}
        {...handleProps}
        className="cursor-grab touch-none rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-500 active:cursor-grabbing dark:hover:bg-slate-800 dark:hover:text-slate-300"
      >
        <GripVertical className="h-4 w-4" />
      </button>
    </td>
  );
}

function TableFolderRow({ sf, p }: { sf: Folder; p: BodyProps }) {
  const src = useEntitySource();
  const { t } = useTranslation();
  const relativeTime = useRelativeTime();
  const drag = useFolderSortable(sf, shareDrag(src));
  const contrast = useFolderContrast(sf);
  const key: SelectionKey = `folder:${sf.id}`;
  const selected = p.selection.has(key);
  const count = p.countDirectItems(sf.id);
  return (
    <tr
      ref={drag.ref}
      style={{ ...drag.style, ...useFolderBgStyle(sf) }}
      className={`cursor-pointer bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 ${contrast}`}
      onClick={() => p.onNavFolder(sf.id)}
    >
      <DragHandleCell
        setRef={drag.setActivatorNodeRef}
        handleProps={{ ...drag.attributes, ...drag.listeners }}
      />
      <td className="px-2 py-2" onClick={stopBubble}>
        <HoverCheckbox
          selected={selected}
          onToggle={() => p.toggle(key)}
          label={selectFolderLabel(t, sf.name)}
          alwaysVisible
        />
      </td>
      <td className="px-2 py-2">
        <FolderIcon sf={sf} size="h-5 w-5" />
      </td>
      <td className="truncate px-2 py-2 font-medium">
        {sf.name}
        {sf.shareOrigin && (
          <Share2
            className="ml-1 inline h-3 w-3 text-blue-500"
            aria-label={t("folder.sharedFrom", { group: sf.shareOrigin })}
          />
        )}
      </td>
      <td className="px-2 py-2 text-slate-400">—</td>
      <td className="px-2 py-2">
        <TagChipList
          tagIds={sf.tagIds ?? []}
          allTags={p.allTags}
          size="sm"
          asLink={src.canLinkTags}
          max={3}
        />
      </td>
      <td className="px-2 py-2 text-xs text-slate-500">
        {t("folder.itemsCount", { count })}
      </td>
      <td className="px-2 py-2 text-xs text-slate-500">
        {relativeTime(sf.createdAt)}
      </td>
      <td className="px-2 py-2" onClick={stopBubble}>
        {/* Right-aligned, like the bookmark rows: the kebab lands in the same
            column on every row even though folders have one action fewer. */}
        <div className="flex items-center justify-end gap-1">
          {src.canFavorite && (
          <FavoriteToggle
            folder={sf}
            {...(src.onToggleFavorite ? { onToggle: src.onToggleFavorite } : {})}
          />
        )}
          <KebabMenu items={p.folderKebab(sf)} />
        </div>
      </td>
    </tr>
  );
}

function TableBookmarkRow({ b, p }: { b: Bookmark; p: BodyProps }) {
  const src = useEntitySource();
  const { t } = useTranslation();
  const relativeTime = useRelativeTime();
  const drag = useBookmarkSortable(b, shareDrag(src));
  const contrast = useBookmarkContrast(b);
  const key: SelectionKey = `bookmark:${b.id}`;
  const selected = p.selection.has(key);
  return (
    <tr
      ref={drag.ref}
      style={{ ...drag.style, ...useBookmarkBgStyle(b) }}
      className={`bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 ${contrast}`}
    >
      <DragHandleCell
        setRef={drag.setActivatorNodeRef}
        handleProps={{ ...drag.attributes, ...drag.listeners }}
      />
      <td className="px-2 py-2">
        <HoverCheckbox
          selected={selected}
          onToggle={() => p.toggle(key)}
          label={selectBookmarkLabel(t, b.title)}
          alwaysVisible
        />
      </td>
      <td className="px-2 py-2">
        <BookmarkIcon b={b} size="h-5 w-5" />
      </td>
      <td className="max-w-[20ch] truncate px-2 py-2 font-medium">
        <Link to={`/bookmark/${b.id}`} className="hover:underline">
          {b.title}
        </Link>
      </td>
      <td className="px-2 py-2 text-xs text-slate-500">
        <div className="flex max-w-[30ch] items-center gap-1">
          <a
            href={b.url}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 truncate hover:underline"
          >
            {b.url}
          </a>
          <CopyButton text={b.url} title={t("bookmark.copyUrl")} />
        </div>
      </td>
      <td className="px-2 py-2">
        <TagChipList
          tagIds={b.tagIds ?? []}
          allTags={p.allTags}
          size="sm"
          asLink={src.canLinkTags}
          max={3}
        />
      </td>
      <td className="px-2 py-2 text-[10px] uppercase tracking-wide text-slate-400">
        <SnapshotStatus status={b.snapshotStatus} />
      </td>
      <td className="px-2 py-2 text-xs text-slate-500">
        {relativeTime(b.createdAt)}
      </td>
      <td className="px-2 py-2">
        <div className="flex items-center justify-end gap-1">
          <a
            href={b.url}
            target="_blank"
            rel="noopener noreferrer"
            title={t("bookmark.openUrlTitle")}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          {src.canFavorite && (
          <FavoriteToggle
            bookmark={b}
            {...(src.onToggleFavorite ? { onToggle: src.onToggleFavorite } : {})}
          />
        )}
          <KebabMenu items={p.bookmarkKebab(b)} />
        </div>
      </td>
    </tr>
  );
}
