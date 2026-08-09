import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";
import { Modal } from "./Modal.js";

interface Props {
  sourceType: "folder" | "bookmark";
  sourceId: string;
  onClose: () => void;
}

export function ShareToGroup({ sourceType, sourceId, onClose }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const groups = useQuery({ queryKey: ["groups"], queryFn: api.listGroups });
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [access, setAccess] = useState<"viewer" | "editor">("viewer");
  const m = useMutation({
    mutationFn: () =>
      api.shareToGroup(pickedId!, { sourceType, sourceId, access }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shared"] });
      qc.invalidateQueries({ queryKey: ["group-shares", pickedId] });
      onClose();
    },
  });
  return (
    <Modal
      title={
        sourceType === "folder"
          ? t("shareToGroup.titleFolder")
          : t("shareToGroup.titleBookmark")
      }
      onClose={onClose}
    >
      <div className="space-y-2">
        {(groups.data ?? []).length === 0 && (
          <div className="text-sm text-slate-500">
            {t("shareToGroup.noGroups")}
          </div>
        )}
        {(groups.data ?? []).map((g) => (
          <label
            key={g.id}
            className="flex cursor-pointer items-center gap-2 rounded border border-slate-200 p-2 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <input
              type="radio"
              name="group"
              checked={pickedId === g.id}
              onChange={() => setPickedId(g.id)}
            />
            <span className="font-medium">{g.name}</span>
            <span className="ml-auto text-xs text-slate-500">
              {t("groups.memberCount", { count: g.memberCount })}
            </span>
          </label>
        ))}
        <div className="flex gap-2 pt-1">
          {(["viewer", "editor"] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAccess(a)}
              className={`flex-1 rounded border px-3 py-2 text-sm ${
                access === a
                  ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                  : "border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              }`}
            >
              {a === "viewer"
                ? t("shareToGroup.accessViewer")
                : t("shareToGroup.accessEditor")}
            </button>
          ))}
        </div>
        <button
          disabled={!pickedId || m.isPending}
          onClick={() => m.mutate()}
          className="w-full rounded bg-slate-900 py-2 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {m.isPending ? t("shareToGroup.sharing") : t("shareToGroup.shareButton")}
        </button>
        <p className="text-xs text-slate-500">{t("shareToGroup.note")}</p>
      </div>
    </Modal>
  );
}
