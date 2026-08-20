import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ClipboardCopy, ExternalLink, PencilLine, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { copyRichLink } from "../lib/clipboard.js";
import { asBookmark } from "../lib/shareAdapter.js";
import { CollapsibleRichText } from "../components/CollapsibleRichText.js";
import { CopyButton } from "../components/CopyButton.js";
import { DescriptionEditDialog } from "../components/DescriptionEditDialog.js";
import { dlg } from "../components/dialogs.js";
import { EntityBanner } from "../components/EntityBanner.js";
import { FavoriteToggle } from "../components/FavoriteToggle.js";
import { InlineTags } from "../components/InlineTags.js";
import { KebabMenu } from "../components/KebabMenu.js";
import { LetterIcon } from "../components/LetterIcon.js";
import {
  SharedNodeEditor,
  type SharedBookmarkPayload,
  type SharedFolderPayload,
  type SharedPayload,
} from "../components/SharedNodeEditor.js";

interface SharedResponse {
  content: SharedPayload;
  access: "viewer" | "editor";
  rev: number;
}

/**
 * The detail of a bookmark inside a group share: the same page, in the same
 * order, as the personal one — banner, back arrow, star / open / edit / kebab,
 * URL with its copy button, tags edited in place, description with its pencil.
 *
 * What is missing is exactly what a share does not have: the snapshot section
 * (archived pages are the owner's), history, share-again and export. Nothing
 * else was cut.
 */
export function SharedBookmarkPage() {
  const { shareId, nodeId } = useParams<{ shareId: string; nodeId: string }>();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [showEdit, setShowEdit] = useState(false);
  const [editDescription, setEditDescription] = useState(false);

  const q = useQuery({
    queryKey: ["shared-content", shareId],
    enabled: !!shareId,
    queryFn: () =>
      api.getSharedContent(shareId!) as Promise<SharedResponse | { error: string }>,
  });

  if (q.isLoading)
    return <div className="text-slate-400">{t("common.loading")}</div>;
  const data = q.data && "content" in q.data ? q.data : null;
  if (!data || data.content.type !== "folder" || !shareId || !nodeId)
    return <div className="text-slate-400">{t("shared.cannotLoad")}</div>;

  const found = findBookmark(data.content, nodeId, []);
  if (!found)
    return <div className="text-slate-400">{t("shared.cannotLoad")}</div>;
  const { node: b, trail } = found;

  const canEdit = data.access === "editor";
  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["shared-content", shareId] });

  // Back to the folder that holds it, addressed the way the share view
  // addresses its folders.
  const backTo = `/shared/${shareId}${trail.length ? `?p=${trail.join(".")}` : ""}`;

  const hasCover = !!(b.image || b.bgColor);
  const iconUrl = b.icon
    ? api.sharedAssetUrl(shareId, b.id, "icon", b.icon)
    : null;

  const remove = async () => {
    if (
      !(await dlg.confirm({
        message: t("sharedEdit.confirmDelete", { name: b.title }),
        danger: true,
      }))
    )
      return;
    try {
      await api.deleteSharedNode(shareId, b.id, data.rev);
      refresh();
      nav(backTo);
    } catch (e) {
      await dlg.alert(e instanceof Error ? e.message : t("common.error"));
    }
  };

  return (
    <div className="space-y-3">
      {hasCover && (
        <EntityBanner
          textTone={b.textTone ?? null}
          imageUrl={
            b.image ? api.sharedAssetUrl(shareId, b.id, "image", b.image) : null
          }
          bgColor={b.bgColor ?? null}
          title={b.title}
          subtitle={b.url}
          icon={
            iconUrl ? (
              <img
                src={iconUrl}
                alt=""
                className="h-14 w-14 shrink-0 rounded-xl object-cover shadow-md ring-2 ring-white/70"
              />
            ) : (
              <LetterIcon
                label={b.title || b.url}
                seed={b.url || b.title}
                size="h-14 w-14 shrink-0 rounded-xl shadow-md ring-2 ring-white/70"
              />
            )
          }
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to={backTo}
          title={t("bookmark.backToFolder")}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        {!hasCover &&
          (iconUrl ? (
            <img src={iconUrl} alt="" className="h-8 w-8 rounded object-cover" />
          ) : (
            <LetterIcon
              label={b.title || b.url}
              seed={b.url || b.title}
              size="h-8 w-8"
            />
          ))}
        {!hasCover && (
          <h1 className="truncate text-xl font-semibold">{b.title}</h1>
        )}
        <div className="ml-auto flex items-center gap-2">
          {canEdit && (
            <FavoriteToggle
              bookmark={asBookmark(b, null, 0)}
              size="h-5 w-5"
              onToggle={async (_k, id, next) => {
                await api.setSharedFavorite(shareId, id, next, data.rev);
                refresh();
              }}
            />
          )}
          <a
            href={b.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded bg-slate-900 px-3 py-1.5 text-sm text-white dark:bg-slate-100 dark:text-slate-900"
          >
            <ExternalLink className="h-4 w-4" />
            <span className="hidden sm:inline">{t("bookmark.openUrl")}</span>
          </a>
          {canEdit && (
            <button
              onClick={() => setShowEdit(true)}
              title={t("common.edit")}
              aria-label={t("common.edit")}
              className="rounded border border-slate-300 p-1.5 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <PencilLine className="h-4 w-4" />
            </button>
          )}
          <KebabMenu
            items={[
              {
                label: t("bookmark.copyLink"),
                icon: <ClipboardCopy className="h-4 w-4" />,
                onClick: () => void copyRichLink(b.title, b.url),
              },
              ...(canEdit
                ? [
                    {
                      label: String(t("common.delete")),
                      icon: <Trash2 className="h-4 w-4" />,
                      danger: true,
                      onClick: () => void remove(),
                    },
                  ]
                : []),
            ]}
          />
        </div>
      </div>

      <div className="flex items-start gap-1">
        <div className="break-all text-sm text-slate-500">{b.url}</div>
        <CopyButton text={b.url} title={t("bookmark.copyUrl")} size="h-4 w-4" />
      </div>

      {canEdit ? (
        <InlineTags
          entity="bookmark"
          id={b.id}
          tagIds={(b.tags ?? []).map((tg) => tg.name)}
          onSaved={refresh}
          share={{
            tags: b.tags ?? [],
            save: (names) => api.setSharedTags(shareId, b.id, names),
          }}
        />
      ) : (
        (b.tags ?? []).length > 0 && (
          <InlineTagsReadOnly tags={b.tags ?? []} />
        )
      )}

      {b.description && (
        <CollapsibleRichText
          html={b.description}
          {...(canEdit ? { onEdit: () => setEditDescription(true) } : {})}
        />
      )}

      {editDescription && (
        <DescriptionEditDialog
          entity="bookmark"
          id={b.id}
          title={b.title}
          html={b.description ?? ""}
          baseRev={data.rev}
          onClose={() => setEditDescription(false)}
          onSaved={refresh}
          save={async (description) => {
            await api.editSharedNode(shareId, b.id, {
              title: b.title,
              url: b.url,
              description,
              baseRev: data.rev,
            });
          }}
        />
      )}

      {showEdit && (
        <SharedNodeEditor
          shareId={shareId}
          node={b}
          baseRev={data.rev}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            refresh();
            setShowEdit(false);
          }}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

/** The chips alone, for a viewer: nothing to edit, nowhere to link. */
function InlineTagsReadOnly({ tags }: { tags: { name: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((tg) => (
        <span
          key={tg.name}
          style={{
            background: `${tg.color}2e`,
            color: tg.color,
            border: `1px solid ${tg.color}73`,
          }}
          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
        >
          {tg.name}
        </span>
      ))}
    </div>
  );
}

/** Walk the share for the bookmark and the trail of folder ids above it. */
function findBookmark(
  folder: SharedFolderPayload,
  nodeId: string,
  trail: string[],
): { node: SharedBookmarkPayload; trail: string[] } | null {
  for (const b of folder.bookmarks) {
    if (b.id === nodeId) return { node: b, trail };
  }
  for (const sub of folder.subfolders) {
    const hit = findBookmark(sub, nodeId, [...trail, sub.id]);
    if (hit) return hit;
  }
  return null;
}
