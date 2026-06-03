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
  const m = useMutation({
    mutationFn: () =>
      api.shareToGroup(pickedId!, { sourceType, sourceId }),
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
