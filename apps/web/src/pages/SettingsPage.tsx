import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Route, Routes } from "react-router-dom";
import { ApiError, api } from "../api.js";
import { useAuth } from "../auth.js";
import { CloudSetupHelp } from "../components/CloudSetupHelp.js";
import { Modal } from "../components/Modal.js";
import { WebDAVFolderPicker } from "../components/WebDAVFolderPicker.js";
import { HelpCircle } from "lucide-react";

export function SettingsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[12rem_1fr] md:gap-6">
      <nav className="flex flex-wrap gap-1 text-sm md:flex-col md:flex-nowrap">
        <Tab to="/settings">{t("settings.tabs.profile")}</Tab>
        <Tab to="/settings/security">{t("settings.tabs.security")}</Tab>
        <Tab to="/settings/cloud">{t("settings.tabs.cloud")}</Tab>
        <Tab to="/settings/import-export">{t("settings.tabs.importExport")}</Tab>
        {isAdmin && <Tab to="/settings/admin">{t("settings.tabs.admin")}</Tab>}
        {isAdmin && <Tab to="/settings/logs">{t("settings.tabs.logs")}</Tab>}
      </nav>
      <Routes>
        <Route index element={<Profile />} />
        <Route path="security" element={<Security />} />
        <Route path="cloud" element={<Cloud />} />
        <Route path="import-export" element={<ImportExport />} />
        {isAdmin && <Route path="admin" element={<Admin />} />}
        {isAdmin && <Route path="logs" element={<Logs />} />}
      </Routes>
    </div>
  );
}

function Tab({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `block rounded px-2 py-1 ${
          isActive ? "bg-slate-200 dark:bg-slate-800" : "hover:bg-slate-100 dark:hover:bg-slate-800"
        }`
      }
    >
      {children}
    </NavLink>
  );
}

function Profile() {
  const { t } = useTranslation();
  const { user, refresh } = useAuth();
  const [nickname, setNickname] = useState(user?.nickname ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const saveNick = useMutation({
    mutationFn: () => api.updateMyProfile({ nickname: nickname.trim() }),
    onSuccess: () => {
      refresh();
      setMsg(t("settings.profile.nicknameSaved"));
    },
    onError: (e) =>
      setMsg(e instanceof ApiError ? e.message : t("settings.profile.saveError")),
  });
  const toggleAuto = useMutation({
    mutationFn: (value: boolean) =>
      api.updateMyProfile({ autoSnapshots: value }),
    onSuccess: () => refresh(),
  });
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t("settings.profile.heading")}</h2>

      <div className="text-sm text-slate-600 dark:text-slate-400">
        {t("settings.profile.emailLabel")}{" "}
        <span className="font-mono">{user?.email}</span>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-xs text-slate-500">
          {t("settings.profile.nicknameLabel")}
        </span>
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="tu_nickname"
          minLength={3}
          maxLength={32}
          pattern="[a-zA-Z0-9._\-]+"
          className="w-80 rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
        />
      </label>
      <button
        onClick={() => saveNick.mutate()}
        disabled={
          !nickname || saveNick.isPending || nickname === user?.nickname
        }
        className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
      >
        {t("settings.profile.saveNickname")}
      </button>
      {msg && <div className="text-sm text-slate-500">{msg}</div>}

      <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
        <h3 className="mb-2 text-sm font-medium">
          {t("settings.profile.autoSnapshotsHeading")}
        </h3>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={user?.autoSnapshots ?? true}
            onChange={(e) => toggleAuto.mutate(e.target.checked)}
            disabled={toggleAuto.isPending}
          />
          <span>
            {t("settings.profile.autoSnapshotsLabel")}
            <span className="block text-xs text-slate-500">
              {t("settings.profile.autoSnapshotsHint")}
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}

function Security() {
  const { t } = useTranslation();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => api.changePassword(current, next),
    onSuccess: () => {
      setMsg(t("settings.security.passwordUpdated"));
      setCurrent("");
      setNext("");
    },
    onError: (e) => setMsg(e instanceof ApiError ? e.message : t("common.error")),
  });
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">{t("settings.security.heading")}</h2>
      <input
        type="password"
        placeholder={t("settings.security.currentPassword")}
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        className="w-80 rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
      />
      <input
        type="password"
        placeholder={t("settings.security.newPassword")}
        value={next}
        onChange={(e) => setNext(e.target.value)}
        className="w-80 rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
      />
      <button
        onClick={() => m.mutate()}
        disabled={!current || !next || m.isPending}
        className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
      >
        {t("settings.security.changeButton")}
      </button>
      {msg && <div className="text-sm text-slate-500">{msg}</div>}
    </div>
  );
}

function Cloud() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const conns = useQuery({
    queryKey: ["cloud", "connections"],
    queryFn: api.listConnections,
  });
  const [showSyno, setShowSyno] = useState(false);
  const [help, setHelp] = useState<"gdrive" | "onedrive" | "synology" | null>(
    null,
  );
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">{t("settings.cloud.heading")}</h2>
      <div className="space-y-2">
        {(conns.data ?? []).map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-3 rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
          >
            <div>
              <div className="font-medium">{c.label}</div>
              <div className="text-xs text-slate-500">
                {c.provider} ·{" "}
                {t("settings.cloud.lastBackup", {
                  when: c.lastBackupAt ?? t("settings.cloud.never"),
                })}
              </div>
            </div>
            <button
              onClick={async () => {
                await api.startBackup(c.id);
                qc.invalidateQueries({ queryKey: ["cloud", "connections"] });
              }}
              className="ml-auto rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              {t("settings.cloud.backupNow")}
            </button>
            <button
              onClick={async () => {
                if (!confirm(t("settings.cloud.confirmDelete"))) return;
                await api.deleteConnection(c.id);
                qc.invalidateQueries({ queryKey: ["cloud", "connections"] });
              }}
              className="text-xs text-slate-400 hover:text-red-600"
            >
              {t("settings.cloud.delete")}
            </button>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <ConnectRow
          label={t("settings.cloud.connectGdrive")}
          href="/api/cloud/connect/gdrive"
          onHelp={() => setHelp("gdrive")}
        />
        <ConnectRow
          label={t("settings.cloud.connectOneDrive")}
          href="/api/cloud/connect/onedrive"
          onHelp={() => setHelp("onedrive")}
        />
        <ConnectRow
          label={t("settings.cloud.connectSynology")}
          onClick={() => setShowSyno(true)}
          onHelp={() => setHelp("synology")}
        />
      </div>

      {showSyno && (
        <SynologyDialog
          onClose={() => setShowSyno(false)}
          onSaved={() =>
            qc.invalidateQueries({ queryKey: ["cloud", "connections"] })
          }
        />
      )}
      {help && (
        <CloudSetupHelp provider={help} onClose={() => setHelp(null)} />
      )}
    </div>
  );
}

function SynologyDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    label: "Synology",
    url: "https://nas.local:5006",
    username: "",
    password: "",
    basePath: "/AwesomeBookmarks",
  });
  const [showBrowser, setShowBrowser] = useState(false);
  const [testStatus, setTestStatus] = useState<{
    state: "idle" | "ok" | "err";
    message: string;
  }>({ state: "idle", message: "" });

  const test = useMutation({
    mutationFn: () =>
      api.testSynology({
        url: form.url,
        username: form.username,
        password: form.password,
      }),
    onSuccess: (r) =>
      setTestStatus({
        state: r.ok ? "ok" : "err",
        message: r.message,
      }),
    onError: (e) =>
      setTestStatus({
        state: "err",
        message: e instanceof ApiError ? e.message : t("common.error"),
      }),
  });

  const save = useMutation({
    mutationFn: () => api.connectSynology(form),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });

  const set =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [k]: e.target.value });

  const credsReady = !!form.url && !!form.username && !!form.password;

  return (
    <Modal title={t("settings.cloud.synologyDialogTitle")} onClose={onClose} size="md">
      <div className="space-y-2">
        <Field label={t("settings.cloud.label")}>
          <input value={form.label} onChange={set("label")} className={inputCls} />
        </Field>
        <Field label={t("settings.cloud.url")}>
          <input
            value={form.url}
            onChange={set("url")}
            placeholder={t("settings.cloud.urlPlaceholder")}
            className={inputCls}
          />
        </Field>
        <Field label={t("settings.cloud.username")}>
          <input
            value={form.username}
            onChange={set("username")}
            className={inputCls}
          />
        </Field>
        <Field label={t("settings.cloud.password")}>
          <input
            type="password"
            value={form.password}
            onChange={set("password")}
            className={inputCls}
          />
        </Field>
        <Field label={t("settings.cloud.basePath")}>
          <div className="flex gap-2">
            <input
              value={form.basePath}
              onChange={set("basePath")}
              placeholder={t("settings.cloud.basePathPlaceholder")}
              className={`${inputCls} flex-1`}
            />
            <button
              type="button"
              onClick={() => {
                if (!credsReady) {
                  setTestStatus({
                    state: "err",
                    message: t("settings.cloud.fillCredsFirst"),
                  });
                  return;
                }
                setShowBrowser(true);
              }}
              className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              {t("settings.cloud.browse")}
            </button>
          </div>
        </Field>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => test.mutate()}
            disabled={!credsReady || test.isPending}
            className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {test.isPending
              ? t("settings.cloud.testing")
              : t("settings.cloud.testConnection")}
          </button>
          {testStatus.state === "ok" && (
            <span className="text-sm text-emerald-600">
              ✓ {testStatus.message}
            </span>
          )}
          {testStatus.state === "err" && (
            <span className="text-sm text-red-600">✗ {testStatus.message}</span>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={() => save.mutate()}
            disabled={!credsReady || save.isPending}
            className="flex-1 rounded bg-slate-900 py-2 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            {save.isPending ? t("settings.cloud.saving") : t("settings.cloud.save")}
          </button>
          <button
            onClick={onClose}
            className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700"
          >
            {t("settings.cloud.cancel")}
          </button>
        </div>

        {showBrowser && (
          <WebDAVFolderPicker
            auth={{
              url: form.url,
              username: form.username,
              password: form.password,
            }}
            initialPath={form.basePath || "/"}
            onSelect={(p) => {
              setForm({ ...form, basePath: p });
              setShowBrowser(false);
            }}
            onClose={() => setShowBrowser(false)}
          />
        )}
      </div>
    </Modal>
  );
}

const inputCls =
  "w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-xs text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function ImportExport() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const folders = useQuery({
    queryKey: ["folders"],
    queryFn: api.listFolders,
  });
  const folderOptions = useMemo(
    () => buildFolderOptions(folders.data ?? []),
    [folders.data],
  );

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [fetchSnapshots, setFetchSnapshots] = useState<boolean>(
    user?.autoSnapshots ?? true,
  );
  const [parentId, setParentId] = useState<string>("");
  const [wrapperName, setWrapperName] = useState<string>(
    `Import ${new Date().toISOString().slice(0, 10)}`,
  );

  const watchImport = (jobId: string) => {
    const start = Date.now();
    const tick = setInterval(async () => {
      qc.invalidateQueries({ queryKey: ["folders"] });
      qc.invalidateQueries({ queryKey: ["bookmarks"] });
      try {
        const jobs = await api.adminListJobs?.({ limit: 50 }).catch(() => null);
        if (jobs && Array.isArray(jobs)) {
          const j = jobs.find((x) => x.id === jobId);
          if (j && j.status !== "pending" && j.status !== "running") {
            setMsg(
              j.status === "done"
                ? t("settings.importExport.importDone")
                : t("settings.importExport.importFinishedStatus", {
                    status: j.status,
                    error: j.lastError ? " — " + j.lastError : "",
                  }),
            );
            clearInterval(tick);
            return;
          }
        }
      } catch {
        /* non-admin can't poll; just keep invalidating */
      }
      if (Date.now() - start > 30_000) {
        clearInterval(tick);
        setMsg((m) => `${m ?? ""}${t("settings.importExport.refreshHint")}`);
      }
    }, 2000);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const r = await api.importHtml(file, {
        fetchSnapshots,
        parentId: parentId || null,
        wrapperFolderName: wrapperName.trim() || undefined,
      });
      const parts = [
        t("settings.importExport.jobEnqueued", { jobId: r.jobId }),
        fetchSnapshots ? "" : t("settings.importExport.withoutSnapshots"),
        wrapperName.trim()
          ? t("settings.importExport.insideWrapper", { name: wrapperName.trim() })
          : parentId
            ? t("settings.importExport.inSelectedFolder")
            : t("settings.importExport.inRoot"),
      ].filter(Boolean);
      setMsg(parts.join(" — "));
      watchImport(r.jobId);
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : t("common.error"));
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">{t("settings.importExport.heading")}</h2>
      <p className="text-sm text-slate-500">{t("settings.importExport.description")}</p>

      <label className="block text-sm">
        <span className="mb-1 block text-xs text-slate-500">
          {t("settings.importExport.destFolderLabel")}
        </span>
        <select
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          disabled={busy}
          className="w-80 rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
        >
          <option value="">{t("settings.importExport.destRoot")}</option>
          {folderOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {"— ".repeat(o.depth)}
              {o.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-xs text-slate-500">
          {t("settings.importExport.wrapperLabel")}
        </span>
        <input
          value={wrapperName}
          onChange={(e) => setWrapperName(e.target.value)}
          disabled={busy}
          maxLength={256}
          placeholder={t("settings.importExport.wrapperPlaceholder", {
            date: "2026-05-06",
          })}
          className="w-80 rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
        />
        <span className="mt-0.5 block text-xs text-slate-500">
          {t("settings.importExport.wrapperHint")}
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={fetchSnapshots}
          onChange={(e) => setFetchSnapshots(e.target.checked)}
          disabled={busy}
        />
        <span>
          {t("settings.importExport.autoSnapshotsLabel")}
          <span className="block text-xs text-slate-500">
            {t("settings.importExport.autoSnapshotsHint")}
          </span>
        </span>
      </label>

      <input
        type="file"
        accept=".html,.htm"
        onChange={onFile}
        disabled={busy}
      />
      {msg && <div className="text-sm text-slate-500">{msg}</div>}
    </div>
  );
}

interface FolderOpt {
  id: string;
  name: string;
  depth: number;
}

function buildFolderOptions(
  flat: Array<{ id: string; name: string; parentId: string | null }>,
): FolderOpt[] {
  const byParent = new Map<string | null, typeof flat>();
  for (const f of flat) {
    const list = byParent.get(f.parentId) ?? [];
    list.push(f);
    byParent.set(f.parentId, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  const out: FolderOpt[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const f of byParent.get(parentId) ?? []) {
      out.push({ id: f.id, name: f.name, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

function Admin() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: api.adminListUsers,
  });
  const del = useMutation({
    mutationFn: (id: string) => api.adminDeleteUser(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });
  const role = useMutation({
    mutationFn: ({ id, r }: { id: string; r: "user" | "admin" }) =>
      api.adminSetUserRole(id, r),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">{t("settings.admin.heading")}</h2>
      {users.isLoading && <div className="text-slate-400">{t("common.loading")}</div>}
      <div className="space-y-2">
        {(users.data ?? []).map((u) => (
          <div
            key={u.id}
            className="flex flex-wrap items-center gap-2 rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex-1">
              <div className="font-medium">{u.email}</div>
              <div className="text-xs text-slate-500">
                {t("settings.admin.bookmarksFoldersCreated", {
                  bookmarks: u.bookmarkCount,
                  folders: u.folderCount,
                  when: u.createdAt.slice(0, 10),
                })}
              </div>
            </div>
            <select
              value={u.role}
              onChange={(e) =>
                role.mutate({ id: u.id, r: e.target.value as "user" | "admin" })
              }
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="user">{t("settings.admin.roleUser")}</option>
              <option value="admin">{t("settings.admin.roleAdmin")}</option>
            </select>
            <button
              onClick={async () => {
                if (
                  !confirm(
                    t("settings.admin.confirmDeleteUser", { email: u.email }),
                  )
                )
                  return;
                del.mutate(u.id);
              }}
              className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
            >
              {t("settings.admin.delete")}
            </button>
          </div>
        ))}
        {(users.data ?? []).length === 0 && !users.isLoading && (
          <div className="text-sm text-slate-400">{t("settings.admin.noUsers")}</div>
        )}
      </div>
    </div>
  );
}

function ConnectRow({
  label,
  href,
  onClick,
  onHelp,
}: {
  label: string;
  href?: string;
  onClick?: () => void;
  onHelp: () => void;
}) {
  const { t } = useTranslation();
  const cls =
    "flex-1 rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800";
  return (
    <div className="flex items-stretch gap-2">
      {href ? (
        <a href={href} className={cls}>
          {label}
        </a>
      ) : (
        <button onClick={onClick} className={`${cls} text-left`}>
          {label}
        </button>
      )}
      <button
        type="button"
        onClick={onHelp}
        title={t("settings.cloud.helpHint")}
        className="flex items-center gap-1 rounded border border-slate-300 px-3 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100"
      >
        <HelpCircle className="h-4 w-4" /> {t("settings.cloud.help")}
      </button>
    </div>
  );
}

function Logs() {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const jobs = useQuery({
    queryKey: ["admin-jobs", statusFilter, typeFilter],
    queryFn: () =>
      api.adminListJobs({
        status: statusFilter || undefined,
        type: typeFilter || undefined,
        limit: 200,
      }),
    refetchInterval: autoRefresh ? 5000 : false,
  });
  const purge = useMutation({
    mutationFn: (status: string) => api.adminDeleteJobsByStatus(status),
    onSuccess: () => jobs.refetch(),
  });

  const errored = (jobs.data ?? []).filter((j) => j.status === "error");
  const all = jobs.data ?? [];

  const copyAll = () => {
    const text = all
      .map(
        (j) =>
          `[${j.createdAt}] ${j.type} ${j.id} status=${j.status} attempts=${j.attempts} user=${j.userEmail}\n  error=${
            j.lastError ?? t("settings.logs.none")
          }`,
      )
      .join("\n\n");
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{t("settings.logs.heading")}</h2>
        <span className="text-xs text-slate-500">
          {t("settings.logs.summary", {
            errored: errored.length,
            total: all.length,
          })}
        </span>
        <button
          onClick={copyAll}
          disabled={all.length === 0}
          className="ml-auto rounded border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          {t("settings.logs.copyAll")}
        </button>
        <button
          onClick={async () => {
            if (
              !confirm(
                t("settings.logs.confirmCleanErrors", { count: errored.length }),
              )
            )
              return;
            purge.mutate("error");
          }}
          disabled={errored.length === 0 || purge.isPending}
          className="rounded border border-red-300 px-3 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:hover:bg-red-950"
        >
          {purge.isPending ? t("settings.logs.cleaning") : t("settings.logs.cleanErrors")}
        </button>
        <button
          onClick={() => jobs.refetch()}
          className="rounded border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          {t("settings.logs.refresh")}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label>
          {t("settings.logs.statusLabel")}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="ml-1 rounded border border-slate-300 bg-white px-2 py-0.5 dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="">{t("settings.logs.all")}</option>
            <option value="pending">pending</option>
            <option value="pending_user_key">pending_user_key</option>
            <option value="running">running</option>
            <option value="done">done</option>
            <option value="error">error</option>
          </select>
        </label>
        <label>
          {t("settings.logs.typeLabel")}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="ml-1 rounded border border-slate-300 bg-white px-2 py-0.5 dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="">{t("settings.logs.all")}</option>
            <option value="snapshot">snapshot</option>
            <option value="backup">backup</option>
            <option value="import">import</option>
            <option value="share_seal">share_seal</option>
            <option value="group_share_seal">group_share_seal</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          {t("settings.logs.autoRefresh")}
        </label>
      </div>

      <div className="space-y-2">
        {all.length === 0 && !jobs.isLoading && (
          <div className="text-sm text-slate-400">{t("settings.logs.noJobs")}</div>
        )}
        {all.map((j) => (
          <JobRow key={j.id} job={j} />
        ))}
      </div>
    </div>
  );
}

function JobRow({
  job,
}: {
  job: {
    id: string;
    type: string;
    status: string;
    attempts: number;
    lastError: string | null;
    availableAt: string;
    startedAt: string | null;
    finishedAt: string | null;
    createdAt: string;
    userEmail: string;
  };
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const colorByStatus: Record<string, string> = {
    error: "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950",
    done: "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950",
    running: "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950",
    pending: "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900",
    pending_user_key:
      "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950",
  };
  const cls = colorByStatus[job.status] ?? colorByStatus.pending;
  const copy = () => {
    const text = `id=${job.id}
type=${job.type}
status=${job.status}
attempts=${job.attempts}
user=${job.userEmail}
created=${job.createdAt}
started=${job.startedAt ?? "—"}
finished=${job.finishedAt ?? "—"}

error:
${job.lastError ?? t("settings.logs.none")}`;
    navigator.clipboard.writeText(text);
  };
  return (
    <div className={`rounded border p-3 text-sm ${cls}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-slate-200 px-2 py-0.5 text-[10px] uppercase tracking-wider dark:bg-slate-700">
          {job.type}
        </span>
        <span
          className={`rounded px-2 py-0.5 text-[10px] uppercase tracking-wider ${
            job.status === "error"
              ? "bg-red-200 dark:bg-red-800"
              : "bg-slate-200 dark:bg-slate-700"
          }`}
        >
          {job.status}
        </span>
        <span className="text-xs text-slate-500">
          {t("settings.logs.attemptsLabel", { count: job.attempts })} · {job.userEmail}
        </span>
        <span className="ml-auto text-xs text-slate-400">{job.createdAt}</span>
      </div>
      {job.lastError && (
        <div className="mt-2">
          <button
            onClick={() => setOpen((o) => !o)}
            className="text-xs text-slate-600 underline hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
          >
            {open ? t("settings.logs.hideError") : t("settings.logs.showError")}
          </button>
          <button
            onClick={copy}
            className="ml-2 text-xs text-slate-600 underline hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
          >
            {t("settings.logs.copyOne")}
          </button>
          {open && (
            <pre className="mt-1 overflow-auto rounded bg-white p-2 text-xs dark:bg-slate-900">
              {job.lastError}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
