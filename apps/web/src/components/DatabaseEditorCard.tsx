import { useQuery } from "@tanstack/react-query";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { ChevronDown, ChevronUp, GripVertical, Table2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";
import { DB_BLOCK_CLASS } from "../lib/richDatabase.js";

/**
 * How an embedded database looks *inside the editor*.
 *
 * Not the grid: the grid lives where the note is read, because editing prose
 * and filling in a hundred cells are different jobs. But a bare box with a name
 * in it tells you nothing, so this says what the table is, how big it is, and
 * lets you rename it without leaving the editor, which is otherwise the one
 * thing you cannot do to a database from anywhere.
 */
export function DatabaseEditorCard({
  node,
  updateAttributes,
  editor,
  getPos,
}: NodeViewProps) {
  const { t } = useTranslation();
  const id = node.attrs.dbId as string | null;
  const [name, setName] = useState((node.attrs.dbName as string) ?? "");
  const [editing, setEditing] = useState(false);

  const blockId = node.attrs.blockId as string | null;
  const viewId = (node.attrs.viewId as string | null) ?? "";

  const { data, isError, refetch } = useQuery({
    queryKey: ["database", id, blockId],
    queryFn: () => api.getDatabase(id!, blockId),
    enabled: !!id,
  });

  // Follow the server, except while the field is being typed in.
  useEffect(() => {
    if (!editing && data?.name) setName(data.name);
  }, [data?.name, editing]);

  /**
   * Where this block sits among its siblings, recomputed whenever the document
   * changes.
   *
   * Subscribed to `update` rather than `transaction`: a node view re-renders
   * when its *own* node changes, and moving a different block does not do
   * that, so the arrows would keep showing stale enabled/disabled states.
   * Selection changes are far more frequent and cannot move anything, which is
   * why they are not listened to.
   */
  const [, bumpPosition] = useState(0);
  useEffect(() => {
    const on = () => bumpPosition((n) => n + 1);
    editor.on("update", on);
    return () => {
      editor.off("update", on);
    };
  }, [editor]);

  const place = (() => {
    const pos = typeof getPos === "function" ? getPos() : null;
    if (pos == null) return null;
    try {
      const $pos = editor.state.doc.resolve(pos);
      return { pos, parent: $pos.parent, index: $pos.index() };
    } catch {
      // The position can be stale for a frame after a document change.
      return null;
    }
  })();
  const canMove = (dir: -1 | 1) => {
    if (!place) return false;
    const next = place.index + dir;
    return next >= 0 && next < place.parent.childCount;
  };

  /**
   * Move the block one place up or down.
   *
   * Dragging (the grip) is the fast way and can drop anywhere; this is the one
   * that works with a keyboard and on a phone, where dragging a block around
   * inside a contenteditable is a fight.
   *
   * Implemented as a delete and a re-insert in one transaction, so it is a
   * single undo step rather than two.
   */
  const move = (dir: -1 | 1) => {
    if (!place || !canMove(dir)) return;
    const { pos, parent, index } = place;
    const self = parent.child(index);
    const tr = editor.state.tr;
    tr.delete(pos, pos + self.nodeSize);
    // Positions after the delete: moving up lands where the previous sibling
    // starts; moving down lands after the next one, which has shifted left by
    // exactly this node's size.
    const target =
      dir === -1
        ? pos - parent.child(index - 1).nodeSize
        : pos + parent.child(index + 1).nodeSize;
    tr.insert(target, self);
    editor.view.dispatch(tr);
    editor.view.focus();
  };

  const commit = async () => {
    setEditing(false);
    const next = name.trim();
    if (!id || !next || next === data?.name) return;
    await api.renameDatabase(id, next);
    // Written into the note as well, so the block still names the table when
    // it is rendered somewhere that has not loaded the data yet.
    updateAttributes({ dbName: next });
    await refetch();
  };

  return (
    <NodeViewWrapper
      as="div"
      className={DB_BLOCK_CLASS}
      data-testid="db-editor-card"
    >
      <div className="flex items-center gap-2">
        {/* The drag handle. ProseMirror looks for `data-drag-handle` inside a
            node view; without it the card is not draggable however much the
            node declares itself to be. Kept to a grip rather than the whole
            card so selecting the name still selects text. */}
        <span
          data-drag-handle
          draggable
          contentEditable={false}
          title={t("db.moveBlock")}
          aria-label={t("db.moveBlock")}
          className="shrink-0 cursor-grab opacity-60 hover:opacity-100 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </span>
        <Table2 className="h-4 w-4 shrink-0 opacity-70" />
        {editing ? (
          <input
            value={name}
            autoFocus
            aria-label={t("db.renameDatabase")}
            onChange={(e) => setName(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setName(data?.name ?? "");
                setEditing(false);
              }
            }}
            className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-1 py-0.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title={t("db.renameDatabase")}
            className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline"
          >
            {name || t("db.newName")}
          </button>
        )}
        <span className="flex shrink-0 items-center">
          <button
            type="button"
            disabled={!canMove(-1)}
            onClick={() => move(-1)}
            title={t("db.moveUp")}
            aria-label={t("db.moveUp")}
            className="rounded p-0.5 opacity-60 hover:opacity-100 disabled:opacity-20"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={!canMove(1)}
            onClick={() => move(1)}
            title={t("db.moveDown")}
            aria-label={t("db.moveDown")}
            className="rounded p-0.5 opacity-60 hover:opacity-100 disabled:opacity-20"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </span>
        <span className="shrink-0 text-xs opacity-70">
          {isError
            ? t("db.missing", { name: name })
            : data
              ? t("db.rowCount", { count: data.rows.length })
              : t("db.loading")}
        </span>
      </div>
      {/* Which view this embed shows. Chosen when it is inserted, and changed
          here, because the editor is the only place that can rewrite the
          block's own attributes. */}
      <label className="mt-1 flex items-center gap-2 text-xs opacity-80">
        <span className="shrink-0">{t("db.pinnedView")}</span>
        <select
          value={viewId}
          aria-label={t("db.pinnedView")}
          onChange={(e) => updateAttributes({ viewId: e.target.value || null })}
          className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-1 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-800"
        >
          <option value="">{t("db.unpin")}</option>
          {(data?.views ?? []).map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
              {v.blockId ? ` (${t("db.onlyHereBadge")})` : ""}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-1 text-xs opacity-70">{t("db.editorHint")}</p>
    </NodeViewWrapper>
  );
}
