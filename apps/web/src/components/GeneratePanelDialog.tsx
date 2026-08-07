import type { PanelAccessMode, PanelDetail } from "@awesome-bookmarks/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, api } from "../api.js";
import { Modal } from "./Modal.js";
import { TemplateSwatch } from "./TemplateSwatch.js";

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "panel"
  );
}

const input =
  "w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800";

export function GeneratePanelDialog({
  folderId,
  folderName,
  onClose,
}: {
  folderId: string;
  folderName: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const templates = useQuery({
    queryKey: ["panel-templates"],
    queryFn: api.listTemplates,
  });
  const [title, setTitle] = useState(folderName);
  const [slug, setSlug] = useState(slugify(folderName));
  const [slugEdited, setSlugEdited] = useState(false);
  const [templateId, setTemplateId] = useState<string>("builtin:grid");
  const [accessMode, setAccessMode] = useState<PanelAccessMode>("public");
  const [password, setPassword] = useState("");
  const [emails, setEmails] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<PanelDetail | null>(null);
  const [copied, setCopied] = useState(false);

  const create = useMutation({
    mutationFn: () =>
      api.createPanel({
        title: title.trim(),
        slug,
        folderId,
        templateId,
        accessMode,
        password: accessMode === "password" ? password : undefined,
        userEmails:
          accessMode === "users"
            ? emails.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
            : undefined,
      }),
    onSuccess: (p) => {
      setCreated(p);
      qc.invalidateQueries({ queryKey: ["panels"] });
    },
    onError: (e) =>
      setErr(e instanceof ApiError ? e.message : t("common.error")),
  });

  const accessLabel = (m: PanelAccessMode) =>
    m === "public"
      ? t("panels.access_public")
      : m === "password"
        ? t("panels.access_password")
        : t("panels.access_users");

  const ready =
    title.trim().length > 0 &&
    slug.length > 0 &&
    (accessMode !== "password" || password.length > 0);

  if (created) {
    return (
      <Modal title={t("panels.createdTitle")} onClose={onClose} size="md">
        <p className="text-sm text-slate-500">{t("panels.createdHint")}</p>
        <div className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-800/50">
          <code className="min-w-0 flex-1 truncate text-sm">{created.url}</code>
          <button
            onClick={() => {
              void navigator.clipboard.writeText(created.url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="rounded p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          </button>
          <a
            href={created.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
        <div className="flex justify-end">
          <button onClick={onClose} className="rounded bg-slate-900 px-4 py-2 text-sm text-white dark:bg-slate-100 dark:text-slate-900">
            {t("common.close")}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={t("panels.generateTitle")} onClose={onClose} size="lg">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-slate-500">{t("panels.name")}</span>
            <input
              className={input}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (!slugEdited) setSlug(slugify(e.target.value));
              }}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-slate-500">{t("panels.slug")}</span>
            <input
              className={input}
              value={slug}
              onChange={(e) => {
                setSlugEdited(true);
                setSlug(slugify(e.target.value));
              }}
            />
          </label>
        </div>

        <div className="space-y-1">
          <span className="text-sm text-slate-500">{t("panels.template")}</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(templates.data ?? []).map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => setTemplateId(tpl.id)}
                className={`rounded-lg border p-1.5 text-left ${
                  templateId === tpl.id
                    ? "border-blue-500 ring-1 ring-blue-500"
                    : "border-slate-200 dark:border-slate-700"
                }`}
              >
                <TemplateSwatch config={tpl.config} />
                <div className="mt-1 truncate px-1 text-xs font-medium">{tpl.name}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-sm text-slate-500">{t("panels.access")}</span>
          <div className="flex flex-wrap gap-2">
            {(["public", "password", "users"] as PanelAccessMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setAccessMode(m)}
                className={`rounded-full border px-3 py-1 text-sm ${
                  accessMode === m
                    ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                    : "border-slate-300 dark:border-slate-700"
                }`}
              >
                {accessLabel(m)}
              </button>
            ))}
          </div>
          {accessMode === "password" && (
            <input
              type="password"
              className={input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("panels.passwordPlaceholder")}
            />
          )}
          {accessMode === "users" && (
            <textarea
              className={`${input} h-20`}
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              placeholder={t("panels.emailsPlaceholder")}
            />
          )}
        </div>

        {err && <div className="text-sm text-red-600">{err}</div>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-slate-300 px-4 py-2 text-sm dark:border-slate-700">
            {t("common.cancel")}
          </button>
          <button
            onClick={() => create.mutate()}
            disabled={!ready || create.isPending}
            className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            {create.isPending ? t("common.saving") : t("panels.generate")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
