import type {
  PanelDetail,
  PanelListItem,
  TemplateItem,
} from "@awesome-bookmarks/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  Download,
  ExternalLink,
  LayoutTemplate,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, api, panelPublicUrl } from "../api.js";
import { Modal } from "../components/Modal.js";
import { FaviconPicker } from "../components/FaviconPicker.js";
import { TemplateEditor } from "../components/TemplateEditor.js";
import { TemplateSwatch } from "../components/TemplateSwatch.js";

const input =
  "w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800";
const btn =
  "flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800";

export function PanelsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"panels" | "templates">("panels");
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-xl font-semibold">{t("panels.heading")}</h1>
      <div className="mb-4 flex gap-1">
        <button
          onClick={() => setTab("panels")}
          className={`rounded-lg px-3 py-1.5 text-sm ${tab === "panels" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`}
        >
          {t("panels.tabPanels")}
        </button>
        <button
          onClick={() => setTab("templates")}
          className={`rounded-lg px-3 py-1.5 text-sm ${tab === "templates" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`}
        >
          {t("panels.tabTemplates")}
        </button>
      </div>
      {tab === "panels" ? <PanelsTab /> : <TemplatesTab />}
    </div>
  );
}

function PanelsTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const accessLabel = (m: PanelListItem["accessMode"]) =>
    m === "public"
      ? t("panels.access_public")
      : m === "password"
        ? t("panels.access_password")
        : t("panels.access_users");
  const statusLabel = (s: string) =>
    s === "ready"
      ? t("panels.status_ready")
      : s === "error"
        ? t("panels.status_error")
        : t("panels.status_pending");
  const panels = useQuery({ queryKey: ["panels"], queryFn: api.listPanels });
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<PanelListItem | null>(null);
  const del = useMutation({
    mutationFn: (id: string) => api.deletePanel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["panels"] }),
  });
  const regen = useMutation({
    mutationFn: (id: string) => api.regeneratePanel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["panels"] }),
  });

  const list = useMemo(
    () =>
      (panels.data ?? []).filter(
        (p) =>
          p.title.toLowerCase().includes(q.toLowerCase()) ||
          p.slug.toLowerCase().includes(q.toLowerCase()),
      ),
    [panels.data, q],
  );

  return (
    <div className="space-y-3">
      <input
        className={input}
        placeholder={t("panels.search")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {list.length === 0 && (
        <div className="text-sm text-slate-400">{t("panels.none")}</div>
      )}
      {list.map((p) => (
        <div
          key={p.id}
          className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800"
        >
          <div className="min-w-0 flex-1">
            <div className="font-medium">{p.title}</div>
            <div className="text-xs text-slate-500">
              /panel/{p.slug} · {accessLabel(p.accessMode)} · {statusLabel(p.status)}
            </div>
          </div>
          <a
            href={panelPublicUrl(p.slug)}
            target="_blank"
            rel="noopener noreferrer"
            className={btn}
            title={t("panels.preview")}
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          <button
            className={btn}
            title={t("panels.copyUrl")}
            onClick={() => void navigator.clipboard.writeText(panelPublicUrl(p.slug))}
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            className={btn}
            title={t("panels.regenerate")}
            disabled={regen.isPending}
            onClick={() => regen.mutate(p.id)}
          >
            <RefreshCw className={`h-4 w-4 ${regen.isPending ? "animate-spin" : ""}`} />
          </button>
          <button className={btn} title={t("common.edit")} onClick={() => setEditing(p)}>
            <Pencil className="h-4 w-4" />
          </button>
          <button
            className="flex items-center gap-1 rounded border border-red-300 px-2.5 py-1 text-sm text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
            onClick={() => {
              if (confirm(t("panels.confirmDelete", { title: p.title }))) del.mutate(p.id);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      {editing && (
        <PanelEditModal
          panelId={editing.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["panels"] });
          }}
        />
      )}
    </div>
  );
}

function PanelEditModal({
  panelId,
  onClose,
  onSaved,
}: {
  panelId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const accessLabel = (m: "public" | "password" | "users") =>
    m === "public"
      ? t("panels.access_public")
      : m === "password"
        ? t("panels.access_password")
        : t("panels.access_users");
  const detail = useQuery({
    queryKey: ["panel", panelId],
    queryFn: () => api.getPanel(panelId),
  });
  const bgFileRef = useRef<HTMLInputElement>(null);
  const [bgBusy, setBgBusy] = useState(false);
  const [bgErr, setBgErr] = useState<string | null>(null);

  const afterBgChange = async () => {
    await detail.refetch();
    qc.invalidateQueries({ queryKey: ["panels"] });
  };
  const uploadBg = async (file: File) => {
    setBgBusy(true);
    setBgErr(null);
    try {
      await api.uploadPanelBgAsset(panelId, file);
      await afterBgChange();
    } catch (e) {
      setBgErr(e instanceof ApiError ? e.message : t("common.error"));
    } finally {
      setBgBusy(false);
    }
  };
  const removeBg = async () => {
    setBgBusy(true);
    setBgErr(null);
    try {
      await api.clearPanelBgAsset(panelId);
      await afterBgChange();
    } catch (e) {
      setBgErr(e instanceof ApiError ? e.message : t("common.error"));
    } finally {
      setBgBusy(false);
    }
  };
  const templates = useQuery({ queryKey: ["panel-templates"], queryFn: api.listTemplates });
  const [form, setForm] = useState<Partial<PanelDetail> & { password?: string }>({});
  const [emails, setEmails] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const d = detail.data;
  const val = <K extends keyof PanelDetail>(k: K): PanelDetail[K] | undefined =>
    (form as PanelDetail)[k] ?? d?.[k];

  const save = useMutation({
    mutationFn: () =>
      api.updatePanel(panelId, {
        title: val("title"),
        slug: val("slug"),
        templateId: val("templateId"),
        accessMode: val("accessMode"),
        displayTitle: form.displayTitle ?? undefined,
        tabTitle: form.tabTitle ?? undefined,
        faviconEmoji: form.faviconEmoji ?? undefined,
        password: form.password,
        userEmails:
          val("accessMode") === "users" && emails !== null
            ? emails.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
            : undefined,
      }),
    onSuccess: (saved) => {
      // The detail query backs this dialog, so it has to be refreshed too:
      // invalidating only the list left the cached panel behind and reopening
      // the dialog showed the values from before the save.
      qc.setQueryData(["panel", panelId], saved);
      qc.invalidateQueries({ queryKey: ["panel", panelId] });
      onSaved();
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : t("common.error")),
  });

  return (
    <Modal title={t("panels.editTitle")} onClose={onClose} size="lg">
      {!d ? (
        <div className="text-sm text-slate-400">{t("common.loading")}</div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-slate-500">{t("panels.name")}</span>
              <input
                className={input}
                value={val("title") ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-500">{t("panels.slug")}</span>
              <input
                className={input}
                value={val("slug") ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase() }))}
              />
            </label>
          </div>
          <label className="space-y-1 text-sm">
            <span className="text-slate-500">{t("panels.template")}</span>
            <select
              className={input}
              value={val("templateId") ?? "builtin:grid"}
              onChange={(e) => setForm((f) => ({ ...f, templateId: e.target.value }))}
            >
              {(templates.data ?? []).map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </option>
              ))}
            </select>
          </label>
          <details className="rounded-lg border border-slate-200 p-2 dark:border-slate-800">
            <summary className="cursor-pointer text-sm text-slate-500">
              {t("panels.identityHeading")}
            </summary>
            <div className="mt-2 space-y-2">
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <label className="space-y-1 text-sm">
                  <span className="text-slate-500">{t("panels.displayTitle")}</span>
                  <input
                    className={input}
                    value={form.displayTitle ?? d.displayTitle ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, displayTitle: e.target.value }))}
                    placeholder={d.title}
                  />
                </label>
                <div className="space-y-1 text-sm">
                  <span className="text-slate-500">{t("panels.faviconEmoji")}</span>
                  <FaviconPicker
                    emoji={form.faviconEmoji ?? d.faviconEmoji ?? ""}
                    onEmojiChange={(v) => setForm((f) => ({ ...f, faviconEmoji: v }))}
                    imageUrl={
                      d.faviconKind === "image"
                        ? api.panelFaviconUrl(d.slug, d.updatedAt)
                        : null
                    }
                    onUpload={async (file) => {
                      await api.uploadPanelFavicon(panelId, file);
                      setForm((f) => ({ ...f, faviconEmoji: "" }));
                      await afterBgChange();
                    }}
                    onClearImage={async () => {
                      await api.clearPanelFavicon(panelId);
                      await afterBgChange();
                    }}
                  />
                </div>
              </div>
              <label className="space-y-1 text-sm">
                <span className="text-slate-500">{t("panels.tabTitle")}</span>
                <input
                  className={input}
                  value={form.tabTitle ?? d.tabTitle ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, tabTitle: e.target.value }))}
                  placeholder={t("panels.tabTitlePlaceholder")}
                />
              </label>
            </div>
          </details>
          <details className="rounded-lg border border-slate-200 p-2 dark:border-slate-800">
            <summary className="cursor-pointer text-sm text-slate-500">
              {t("panels.customBg")}
            </summary>
            <div className="mt-2 space-y-2">
              {d.bgAssetKind && (
                <div className="h-28 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                  {d.bgAssetKind === "video" ? (
                    <video
                      src={api.panelBgUrl(d.slug, d.updatedAt)}
                      className="h-full w-full object-cover"
                      muted
                      autoPlay
                      loop
                      playsInline
                    />
                  ) : (
                    <img
                      src={api.panelBgUrl(d.slug, d.updatedAt)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={btn}
                  disabled={bgBusy}
                  onClick={() => bgFileRef.current?.click()}
                >
                  <Upload className="h-4 w-4" /> {t("panels.uploadBg")}
                </button>
                {d.bgAssetKind && (
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded border border-red-300 px-2.5 py-1 text-sm text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
                    disabled={bgBusy}
                    onClick={() => void removeBg()}
                  >
                    <Trash2 className="h-4 w-4" /> {t("panels.removeBg")}
                  </button>
                )}
                {bgBusy && <span className="text-xs text-slate-400">{t("common.saving")}</span>}
              </div>
              <p className="text-xs text-slate-400">{t("panels.customBgHint")}</p>
              {bgErr && <div className="text-sm text-red-600">{bgErr}</div>}
              <input
                ref={bgFileRef}
                type="file"
                accept="image/*,video/mp4,video/webm"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadBg(f);
                  e.target.value = "";
                }}
              />
            </div>
          </details>
          <div className="text-sm text-slate-500">{t("panels.access")}</div>
          <div className="flex flex-wrap gap-2">
            {(["public", "password", "users"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setForm((f) => ({ ...f, accessMode: m }))}
                className={`rounded-full border px-3 py-1 text-sm ${
                  (val("accessMode") ?? "public") === m
                    ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                    : "border-slate-300 dark:border-slate-700"
                }`}
              >
                {accessLabel(m)}
              </button>
            ))}
          </div>
          {val("accessMode") === "password" && (
            <label className="space-y-1 text-sm">
              <span className="text-slate-500">{t("panels.passwordLabel")}</span>
              <input
                type="password"
                className={input}
                placeholder={t("panels.passwordChangePlaceholder")}
                value={form.password ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              />
            </label>
          )}
          {val("accessMode") === "users" && (
            <label className="space-y-1 text-sm">
              <span className="text-slate-500">{t("panels.emailsLabel")}</span>
              <textarea
                className={`${input} h-20`}
                value={emails ?? d.userEmails.join(", ")}
                onChange={(e) => setEmails(e.target.value)}
                placeholder={t("panels.emailsPlaceholder")}
              />
            </label>
          )}
          {err && <div className="text-sm text-red-600">{err}</div>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="rounded border border-slate-300 px-4 py-2 text-sm dark:border-slate-700">
              {t("common.cancel")}
            </button>
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
            >
              {save.isPending ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function TemplatesTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const templates = useQuery({ queryKey: ["panel-templates"], queryFn: api.listTemplates });
  const [q, setQ] = useState("");
  const [editor, setEditor] = useState<{ initial?: TemplateItem } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const del = useMutation({
    mutationFn: (id: string) => api.deleteTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["panel-templates"] }),
  });

  const list = useMemo(
    () =>
      (templates.data ?? []).filter((tpl) =>
        tpl.name.toLowerCase().includes(q.toLowerCase()),
      ),
    [templates.data, q],
  );

  const exportTpl = (tpl: TemplateItem) => {
    const blob = new Blob([JSON.stringify({ name: tpl.name, config: tpl.config }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tpl.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importTpl = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      await api.createTemplate({ name: parsed.name ?? "Importada", config: parsed.config });
      qc.invalidateQueries({ queryKey: ["panel-templates"] });
    } catch {
      alert(t("panels.importError"));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${input} flex-1`}
          placeholder={t("panels.searchTemplates")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className={btn} onClick={() => setEditor({})}>
          <Plus className="h-4 w-4" /> {t("panels.newTemplate")}
        </button>
        <button className={btn} onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4" /> {t("panels.import")}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importTpl(f);
            e.target.value = "";
          }}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {list.map((tpl) => (
          <div
            key={tpl.id}
            className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800"
          >
            <TemplateSwatch config={tpl.config} />
            <div className="flex items-center gap-2">
              <LayoutTemplate className="h-4 w-4 text-slate-400" />
              <span className="min-w-0 flex-1 truncate font-medium">{tpl.name}</span>
              {tpl.builtin && (
                <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] uppercase text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  {t("panels.builtin")}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              <button className={btn} onClick={() => setEditor({ initial: tpl })}>
                <Pencil className="h-4 w-4" /> {tpl.builtin ? t("panels.duplicate") : t("common.edit")}
              </button>
              <button className={btn} onClick={() => exportTpl(tpl)}>
                <Download className="h-4 w-4" /> {t("panels.export")}
              </button>
              {!tpl.builtin && (
                <button
                  className="flex items-center gap-1 rounded border border-red-300 px-2.5 py-1 text-sm text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
                  onClick={() => {
                    if (confirm(t("panels.confirmDeleteTemplate"))) del.mutate(tpl.id);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {editor && (
        <TemplateEditor
          initial={editor.initial}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            qc.invalidateQueries({ queryKey: ["panel-templates"] });
          }}
        />
      )}
    </div>
  );
}
