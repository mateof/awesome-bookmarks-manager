import { GROUP_ROLE_RANK, type ShareResult } from "@awesome-bookmarks/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";
import { Modal } from "./Modal.js";

interface Props {
  sourceType: "folder" | "bookmark" | "database";
  sourceId: string;
  onClose: () => void;
}

/**
 * Share something with one or more groups.
 *
 * There is no access level to choose any more. What each person may do is
 * their role in the group, so asking again here produced two answers to the
 * same question: an editor of the group looking at a share marked "viewer".
 * The group is the unit of access; to give the same people read-only access to
 * one thing and write access to another, put them in two groups.
 */
export function ShareToGroup({ sourceType, sourceId, onClose }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const groups = useQuery({ queryKey: ["groups"], queryFn: api.listGroups });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<ShareResult[] | null>(null);

  const share = useMutation({
    mutationFn: () =>
      api.shareToGroups({ sourceType, sourceId, groupIds: [...picked] }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["shared"] });
      qc.invalidateQueries({ queryKey: ["groups"] });
      for (const r of res) {
        qc.invalidateQueries({ queryKey: ["group-shares", r.groupId] });
      }
      // Close only when every group took it. A partial failure has something
      // to say and closing would swallow it.
      if (res.every((r) => !r.error)) onClose();
      else setResults(res);
    },
  });

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const all = groups.data ?? [];
  // Sharing into a group needs at least editor there: you are handing it
  // content, which is a write.
  const eligible = all.filter(
    (g) => GROUP_ROLE_RANK[g.myRole] >= GROUP_ROLE_RANK.editor,
  );
  const nameOf = (id: string) => all.find((g) => g.id === id)?.name ?? id;

  return (
    <Modal
      title={
        sourceType === "folder"
          ? t("shareToGroup.titleFolder")
          : sourceType === "database"
            ? t("shareToGroup.titleDatabase")
            : t("shareToGroup.titleBookmark")
      }
      onClose={onClose}
    >
      <div className="space-y-2">
        {all.length === 0 && (
          <div className="text-sm text-slate-500">
            {t("shareToGroup.noGroups")}
          </div>
        )}
        {all.length > 0 && eligible.length === 0 && (
          <div className="text-sm text-slate-500">
            {t("shareToGroup.noEditorGroups")}
          </div>
        )}

        {eligible.map((g) => (
          <label
            key={g.id}
            className="flex cursor-pointer items-center gap-2 rounded border border-slate-200 p-2 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <input
              type="checkbox"
              checked={picked.has(g.id)}
              onChange={() => toggle(g.id)}
            />
            <span className="font-medium">{g.name}</span>
            <span className="ml-auto text-xs text-slate-500">
              {t("groups.memberCount", { count: g.memberCount })}
            </span>
          </label>
        ))}

        {results?.some((r) => r.error) && (
          <ul className="rounded border border-red-300 p-2 text-xs text-red-600 dark:border-red-800">
            {results
              .filter((r) => r.error)
              .map((r) => (
                <li key={r.groupId}>
                  {nameOf(r.groupId)}: {r.error}
                </li>
              ))}
          </ul>
        )}

        <button
          disabled={picked.size === 0 || share.isPending}
          onClick={() => share.mutate()}
          className="w-full rounded bg-slate-900 py-2 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {share.isPending
            ? t("shareToGroup.sharing")
            : t("shareToGroup.shareCount", { count: picked.size })}
        </button>
        <p className="text-xs text-slate-500">{t("shareToGroup.rolesNote")}</p>
      </div>
    </Modal>
  );
}
