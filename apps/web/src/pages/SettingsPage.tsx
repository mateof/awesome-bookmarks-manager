import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Cloud as CloudIcon,
  Copy,
  Download,
  Fingerprint,
  HardDrive,
  HelpCircle,
  MonitorSmartphone,
  KeyRound,
  Plus,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  User,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { dlg } from "../components/dialogs.js";
import { NavLink, Route, Routes } from "react-router-dom";
import { ApiError, api } from "../api.js";
import { useAuth } from "../auth.js";
import { registerPasskey, passkeysSupported } from "../webauthn.js";
import { TwoFactorEnroll } from "../components/TwoFactorEnroll.js";
import { CloudSetupHelp } from "../components/CloudSetupHelp.js";
import { Modal } from "../components/Modal.js";
import { WebDAVFolderPicker } from "../components/WebDAVFolderPicker.js";
import { AdminStorage, MyStorage } from "../components/StorageSettings.js";
import { SessionList } from "../components/SessionList.js";
import { SecurityLog } from "../components/SecurityLog.js";
import { CloudVault } from "../components/CloudVault.js";
import {
  CertificateTrust,
  TrustedCertBadge,
  looksLikeCertError,
} from "../components/CertificateTrust.js";

/* ------------------------------------------------------------------ */
/* Shared presentation primitives                                     */
/* ------------------------------------------------------------------ */

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:focus:ring-slate-700/50";
const btnPrimary =
  "inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white";
const btnSecondary =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3.5 py-2 text-sm transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800";
const btnDanger =
  "inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-600 transition hover:bg-red-50 dark:border-red-900/60 dark:hover:bg-red-950";

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      {children}
    </section>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      {icon && (
        <div className="mt-0.5 rounded-lg bg-slate-100 p-2 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function CopyField({
  label,
  value,
  hint,
}: {
  label?: string;
  value: string;
  hint?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      {label && (
        <div className="text-xs font-medium text-slate-500">{label}</div>
      )}
      <div className="flex items-stretch gap-2">
        <code className="flex-1 overflow-x-auto whitespace-pre rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950/40">
          {value}
        </code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="shrink-0 rounded-lg border border-slate-300 px-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          {copied ? (
            <Check className="h-4 w-4 text-emerald-600" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page shell                                                         */
/* ------------------------------------------------------------------ */

export function SettingsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-xl font-semibold">{t("layout.settings")}</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[13rem_1fr] md:gap-6">
        <nav className="flex flex-wrap gap-1 md:flex-col md:flex-nowrap">
          <Tab to="/settings" icon={<User className="h-4 w-4" />}>
            {t("settings.tabs.profile")}
          </Tab>
          <Tab to="/settings/security" icon={<ShieldCheck className="h-4 w-4" />}>
            {t("settings.tabs.security")}
          </Tab>
          <Tab to="/settings/cloud" icon={<CloudIcon className="h-4 w-4" />}>
            {t("settings.tabs.cloud")}
          </Tab>
          <Tab
            to="/settings/import-export"
            icon={<Download className="h-4 w-4" />}
          >
            {t("settings.tabs.importExport")}
          </Tab>
          <Tab to="/settings/storage" icon={<HardDrive className="h-4 w-4" />}>
            {t("settings.tabs.storage")}
          </Tab>
          <Tab to="/settings/api" icon={<KeyRound className="h-4 w-4" />}>
            {t("settings.tabs.api")}
          </Tab>
          {isAdmin && (
            <Tab to="/settings/admin" icon={<Users className="h-4 w-4" />}>
              {t("settings.tabs.admin")}
            </Tab>
          )}
          {isAdmin && (
            <Tab to="/settings/security-log" icon={<ShieldAlert className="h-4 w-4" />}>
              {t("settings.tabs.securityLog")}
            </Tab>
          )}
          {isAdmin && (
            <Tab to="/settings/logs" icon={<ScrollText className="h-4 w-4" />}>
              {t("settings.tabs.logs")}
            </Tab>
          )}
        </nav>
        <div className="min-w-0">
          <Routes>
            <Route index element={<Profile />} />
            <Route path="security" element={<Security />} />
            <Route path="cloud" element={<Cloud />} />
            <Route path="import-export" element={<ImportExport />} />
            <Route path="storage" element={<Storage />} />
            <Route path="api" element={<ApiTokens />} />
            {isAdmin && <Route path="admin" element={<Admin />} />}
            {isAdmin && (
              <Route path="security-log" element={<SecurityLogTab />} />
            )}
            {isAdmin && <Route path="logs" element={<Logs />} />}
          </Routes>
        </div>
      </div>
    </div>
  );
}

function Tab({
  to,
  icon,
  children,
}: {
  to: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
          isActive
            ? "bg-slate-900 font-medium text-white dark:bg-slate-100 dark:text-slate-900"
            : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        }`
      }
    >
      {icon}
      <span>{children}</span>
    </NavLink>
  );
}

/* ------------------------------------------------------------------ */
/* Security log                                                       */
/* ------------------------------------------------------------------ */

function SecurityLogTab() {
  const { t } = useTranslation();
  return (
    <Card>
      <SectionHeader
        icon={<ShieldAlert className="h-5 w-5" />}
        title={t("securityLog.heading")}
        subtitle={t("securityLog.subtitle")}
      />
      <SecurityLog />
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Storage                                                            */
/* ------------------------------------------------------------------ */

function Storage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  return (
    <div className="space-y-4">
      <Card>
        <SectionHeader
          icon={<HardDrive className="h-5 w-5" />}
          title={t("storage.myTitle")}
          subtitle={t("storage.mySubtitle")}
        />
        <MyStorage />
      </Card>
      {user?.role === "admin" && (
        <Card>
          <SectionHeader
            icon={<Users className="h-5 w-5" />}
            title={t("storage.adminTitle")}
            subtitle={t("storage.adminSubtitle")}
          />
          <AdminStorage />
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Profile                                                            */
/* ------------------------------------------------------------------ */

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
    mutationFn: (value: boolean) => api.updateMyProfile({ autoSnapshots: value }),
    onSuccess: () => refresh(),
  });
  const toggleAutoAccept = useMutation({
    mutationFn: (value: boolean) =>
      api.updateMyProfile({ autoAcceptInvitations: value }),
    onSuccess: () => refresh(),
  });
  return (
    <div className="space-y-6">
      <Card>
        <SectionHeader
          icon={<User className="h-5 w-5" />}
          title={t("settings.profile.heading")}
        />
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-500">
              {t("settings.profile.emailLabel")}
            </span>
            <span className="font-mono">{user?.email}</span>
            {user?.role === "admin" && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                admin
              </span>
            )}
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">
              {t("settings.profile.nicknameLabel")}
            </span>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="nickname"
              minLength={3}
              maxLength={32}
              pattern="[a-zA-Z0-9._\-]+"
              className={`${inputCls} max-w-xs`}
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => saveNick.mutate()}
              disabled={
                !nickname || saveNick.isPending || nickname === user?.nickname
              }
              className={btnPrimary}
            >
              {t("settings.profile.saveNickname")}
            </button>
            {msg && <span className="text-sm text-slate-500">{msg}</span>}
          </div>
        </div>
      </Card>

      <Card>
        <SectionHeader
          icon={<Download className="h-5 w-5" />}
          title={t("settings.profile.autoSnapshotsHeading")}
        />
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-slate-700"
            checked={user?.autoSnapshots ?? true}
            onChange={(e) => toggleAuto.mutate(e.target.checked)}
            disabled={toggleAuto.isPending}
          />
          <span>
            {t("settings.profile.autoSnapshotsLabel")}
            <span className="mt-0.5 block text-xs text-slate-500">
              {t("settings.profile.autoSnapshotsHint")}
            </span>
          </span>
        </label>
      </Card>

      <Card>
        <SectionHeader
          icon={<User className="h-5 w-5" />}
          title={t("settings.profile.autoAcceptHeading")}
        />
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-slate-700"
            checked={user?.autoAcceptInvitations ?? false}
            onChange={(e) => toggleAutoAccept.mutate(e.target.checked)}
            disabled={toggleAutoAccept.isPending}
          />
          <span>
            {t("settings.profile.autoAcceptLabel")}
            <span className="mt-0.5 block text-xs text-slate-500">
              {t("settings.profile.autoAcceptHint")}
            </span>
          </span>
        </label>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Security                                                           */
/* ------------------------------------------------------------------ */

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
    <div className="space-y-4">
      <Card>
        <SectionHeader
          icon={<MonitorSmartphone className="h-5 w-5" />}
          title={t("sessions.heading")}
          subtitle={t("sessions.subtitle")}
        />
        <SessionList />
      </Card>
      <Card>
        <SectionHeader
          icon={<ShieldCheck className="h-5 w-5" />}
          title={t("settings.security.heading")}
        />
        <div className="max-w-xs space-y-3">
          <input
            type="password"
            placeholder={t("settings.security.currentPassword")}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            className={inputCls}
          />
          <input
            type="password"
            placeholder={t("settings.security.newPassword")}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            className={inputCls}
          />
          <div className="flex items-center gap-3">
            <button
              onClick={() => m.mutate()}
              disabled={!current || !next || m.isPending}
              className={btnPrimary}
            >
              {t("settings.security.changeButton")}
            </button>
            {msg && <span className="text-sm text-slate-500">{msg}</span>}
          </div>
        </div>
      </Card>
      <TwoFactorCard />
      <PasskeysCard />
    </div>
  );
}

function PasskeysCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const cfg = useQuery({
    queryKey: ["webauthn-config"],
    queryFn: api.webauthnConfig,
  });
  const enabled = cfg.data?.enabled === true;
  const creds = useQuery({
    queryKey: ["webauthn-creds"],
    queryFn: api.webauthnCredentials,
    enabled: enabled && passkeysSupported(),
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const del = useMutation({
    mutationFn: (id: string) => api.webauthnDeleteCredential(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webauthn-creds"] }),
  });

  if (!cfg.data) return null;

  const add = async () => {
    setBusy(true);
    setErr(null);
    try {
      await registerPasskey(label.trim() || "Passkey");
      setLabel("");
      qc.invalidateQueries({ queryKey: ["webauthn-creds"] });
    } catch (e) {
      setErr(
        e instanceof ApiError
          ? e.message
          : e instanceof Error && e.message === "PRF_UNSUPPORTED"
            ? t("twofa.prfUnsupported")
            : e instanceof Error
              ? e.message
              : t("common.error"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <SectionHeader
        icon={<Fingerprint className="h-5 w-5" />}
        title={t("twofa.passkeysHeading")}
        subtitle={t("twofa.passkeysHint")}
      />
      {!enabled ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t("twofa.passkeysDisabled")}
        </p>
      ) : !passkeysSupported() ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t("twofa.passkeysUnsupported")}
        </p>
      ) : (
        <div className="space-y-3">
          {cfg.data.allowPrfless && (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              {t("twofa.prflessNote")}
            </p>
          )}
          <div className="space-y-2">
            {(creds.data ?? []).map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{c.label}</div>
                  <div className="text-xs text-slate-500">
                    {t("twofa.passkeyCreated", { when: c.createdAt.slice(0, 10) })}
                  </div>
                </div>
                <button
                  onClick={async () => {
                    if (await dlg.confirm({
                      message: t("twofa.passkeyConfirmDelete"),
                      danger: true,
                    })) del.mutate(c.id);
                  }}
                  className={btnDanger}
                >
                  {t("settings.admin.delete")}
                </button>
              </div>
            ))}
            {(creds.data ?? []).length === 0 && (
              <div className="text-sm text-slate-400">
                {t("twofa.noPasskeys")}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("twofa.passkeyNamePlaceholder")}
              className={`${inputCls} max-w-xs`}
            />
            <button onClick={add} disabled={busy} className={btnPrimary}>
              <Fingerprint className="h-4 w-4" />{" "}
              {busy ? t("common.saving") : t("twofa.addPasskey")}
            </button>
          </div>
          {err && <div className="text-sm text-red-600">{err}</div>}
        </div>
      )}
    </Card>
  );
}

function TwoFactorCard() {
  const { t } = useTranslation();
  const { user, refresh } = useAuth();
  const [enrolling, setEnrolling] = useState(false);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const enabled = user?.twoFactorEnabled ?? false;
  const disable = useMutation({
    mutationFn: () => api.twoFactorDisable(code.trim()),
    onSuccess: () => {
      setCode("");
      setMsg(t("twofa.disabledOk"));
      refresh();
    },
    onError: (e) => setMsg(e instanceof ApiError ? e.message : t("common.error")),
  });
  return (
    <Card>
      <SectionHeader
        icon={<ShieldCheck className="h-5 w-5" />}
        title={t("twofa.heading")}
      />
      {enabled ? (
        <div className="max-w-xs space-y-3">
          <div className="text-sm font-medium text-green-600 dark:text-green-400">
            {t("twofa.statusEnabled")}
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t("twofa.disableIntro")}
          </p>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t("twofa.codePlaceholder")}
            className={inputCls}
          />
          <div className="flex items-center gap-3">
            <button
              onClick={() => disable.mutate()}
              disabled={code.trim().length < 6 || disable.isPending}
              className={btnDanger}
            >
              {t("twofa.disable")}
            </button>
            {msg && <span className="text-sm text-slate-500">{msg}</span>}
          </div>
        </div>
      ) : enrolling ? (
        <div className="max-w-xs">
          <TwoFactorEnroll
            onEnabled={() => {
              setEnrolling(false);
              refresh();
            }}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t("twofa.intro")}
          </p>
          <button onClick={() => setEnrolling(true)} className={btnPrimary}>
            {t("twofa.enableButton")}
          </button>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Cloud                                                              */
/* ------------------------------------------------------------------ */

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
    <Card>
      <SectionHeader
        icon={<CloudIcon className="h-5 w-5" />}
        title={t("settings.cloud.heading")}
      />
      <div className="space-y-2">
        {(conns.data ?? []).map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800"
          >
            <div className="min-w-0 flex-1">
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
              className={btnSecondary}
            >
              {t("settings.cloud.backupNow")}
            </button>
            <button
              onClick={async () => {
                if (!(await dlg.confirm({
                  message: t("settings.cloud.confirmDelete"),
                  danger: true,
                }))) return;
                await api.deleteConnection(c.id);
                qc.invalidateQueries({ queryKey: ["cloud", "connections"] });
              }}
              className="text-xs text-slate-400 hover:text-red-600"
            >
              {t("settings.cloud.delete")}
            </button>
            <CloudVault connection={c} all={conns.data ?? []} />
          </div>
        ))}
      </div>

      <div className="mt-3 space-y-2">
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
      {help && <CloudSetupHelp provider={help} onClose={() => setHelp(null)} />}
    </Card>
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
    // Set only once the user has looked at a certificate and accepted it.
    certFingerprint: "" as string,
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
        certFingerprint: form.certFingerprint || undefined,
      }),
    onSuccess: (r) =>
      setTestStatus({ state: r.ok ? "ok" : "err", message: r.message }),
    onError: (e) =>
      setTestStatus({
        state: "err",
        message: e instanceof ApiError ? e.message : t("common.error"),
      }),
  });

  const save = useMutation({
    mutationFn: () =>
      api.connectSynology({
        ...form,
        certFingerprint: form.certFingerprint || undefined,
      }),
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
          <input value={form.username} onChange={set("username")} className={inputCls} />
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
              className={btnSecondary}
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
            className={btnSecondary}
          >
            {test.isPending
              ? t("settings.cloud.testing")
              : t("settings.cloud.testConnection")}
          </button>
          {testStatus.state === "ok" && (
            <span className="text-sm text-emerald-600">✓ {testStatus.message}</span>
          )}
          {testStatus.state === "err" && (
            <span className="text-sm text-red-600">✗ {testStatus.message}</span>
          )}
        </div>

        {form.certFingerprint && (
          <TrustedCertBadge fingerprint={form.certFingerprint} />
        )}
        {testStatus.state === "err" &&
          !form.certFingerprint &&
          looksLikeCertError(testStatus.message) && (
            <CertificateTrust
              url={form.url}
              onTrust={(fingerprint) => {
                setForm((f) => ({ ...f, certFingerprint: fingerprint }));
                setTestStatus({ state: "idle", message: "" });
              }}
            />
          )}

        <div className="flex gap-2 pt-2">
          <button
            onClick={() => save.mutate()}
            disabled={!credsReady || save.isPending}
            className={`${btnPrimary} flex-1 justify-center`}
          >
            {save.isPending ? t("settings.cloud.saving") : t("settings.cloud.save")}
          </button>
          <button onClick={onClose} className={btnSecondary}>
            {t("settings.cloud.cancel")}
          </button>
        </div>

        {showBrowser && (
          <WebDAVFolderPicker
            auth={{
              url: form.url,
              username: form.username,
              password: form.password,
              certFingerprint: form.certFingerprint || undefined,
            }}
            onTrustCert={(fingerprint) =>
              setForm((f) => ({ ...f, certFingerprint: fingerprint }))
            }
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
    "flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800";
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
        className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100"
      >
        <HelpCircle className="h-4 w-4" /> {t("settings.cloud.help")}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Import / Export                                                    */
/* ------------------------------------------------------------------ */

function ImportExport() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const folders = useQuery({ queryKey: ["folders"], queryFn: api.listFolders });
  const folderOptions = useMemo(
    () => buildFolderOptions(folders.data ?? []),
    [folders.data],
  );

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Off by default. An import brings hundreds or thousands of URLs, and
  // capturing every one of them is a long run of network fetches that also
  // eats storage quota. Ticking the box is a deliberate choice.
  const [fetchSnapshots, setFetchSnapshots] = useState<boolean>(false);
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
    <Card>
      <SectionHeader
        icon={<Download className="h-5 w-5" />}
        title={t("settings.importExport.heading")}
        subtitle={t("settings.importExport.description")}
      />
      <div className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-slate-500">
            {t("settings.importExport.destFolderLabel")}
          </span>
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            disabled={busy}
            className={`${inputCls} max-w-sm`}
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
            className={`${inputCls} max-w-sm`}
          />
          <span className="mt-1 block text-xs text-slate-500">
            {t("settings.importExport.wrapperHint")}
          </span>
        </label>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-slate-700"
            checked={fetchSnapshots}
            onChange={(e) => setFetchSnapshots(e.target.checked)}
            disabled={busy}
          />
          <span>
            {t("settings.importExport.autoSnapshotsLabel")}
            <span className="mt-0.5 block text-xs text-slate-500">
              {t("settings.importExport.autoSnapshotsHint")}
            </span>
          </span>
        </label>

        <input type="file" accept=".html,.htm" onChange={onFile} disabled={busy} />
        {msg && <div className="text-sm text-slate-500">{msg}</div>}
      </div>
    </Card>
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

/* ------------------------------------------------------------------ */
/* API access & tokens                                                */
/* ------------------------------------------------------------------ */

function ApiTokens() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const tokens = useQuery({
    queryKey: ["api-tokens"],
    queryFn: api.listApiTokens,
  });
  const [label, setLabel] = useState("");
  const [created, setCreated] = useState<string | null>(null);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "http://your-host";

  const create = useMutation({
    mutationFn: () => api.createApiToken(label.trim() || "token"),
    onSuccess: (r) => {
      setCreated(r.token);
      setLabel("");
      qc.invalidateQueries({ queryKey: ["api-tokens"] });
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.revokeApiToken(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-tokens"] }),
  });

  const mcpUrl = `${origin}/api/mcp`;
  const mcpUrlWithToken = created ? `${mcpUrl}?token=${created}` : "";
  const cliCmd = created
    ? `claude mcp add --scope user --transport http awesomebookmarks ${mcpUrl} --header "Authorization: Bearer ${created}"`
    : "";
  const curlCmd = created
    ? `curl ${origin}/api/v1/bookmarks -H "Authorization: Bearer ${created}"`
    : "";

  return (
    <div className="space-y-6">
      <Card>
        <SectionHeader
          icon={<KeyRound className="h-5 w-5" />}
          title={t("settings.api.heading")}
          subtitle={t("settings.api.intro")}
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t("settings.api.labelPlaceholder")}
            maxLength={128}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !create.isPending) create.mutate();
            }}
            className={`${inputCls} w-64`}
          />
          <button
            onClick={() => create.mutate()}
            disabled={create.isPending}
            className={btnPrimary}
          >
            <Plus className="h-4 w-4" /> {t("settings.api.create")}
          </button>
        </div>
      </Card>

      {created && (
        <Card className="border-amber-300 bg-amber-50/60 dark:border-amber-900/70 dark:bg-amber-950/30">
          <SectionHeader
            title={t("settings.api.createdTitle")}
            subtitle={t("settings.api.createdWarning")}
            action={
              <button
                onClick={() => setCreated(null)}
                className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
              >
                {t("common.close")}
              </button>
            }
          />
          <div className="space-y-5">
            <CopyField label={t("settings.api.tokenLabel")} value={created} />

            <div className="space-y-2">
              <div className="text-sm font-medium">
                {t("settings.api.claudeTitle")}
              </div>
              <p className="text-xs text-slate-500">
                {t("settings.api.claudeHint")}
              </p>
              <CopyField
                label={t("settings.api.mcpUrlLabel")}
                value={mcpUrlWithToken}
                hint={t("settings.api.urlNote")}
              />
              <CopyField label={t("settings.api.cliTitle")} value={cliCmd} />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">
                {t("settings.api.restTitle")}
              </div>
              <CopyField value={curlCmd} />
            </div>
          </div>
        </Card>
      )}

      <Card>
        <SectionHeader title={t("settings.api.tokensListTitle")} />
        <div className="space-y-2">
          {(tokens.data ?? []).map((tok) => (
            <div
              key={tok.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium">{tok.label}</div>
                <div className="text-xs text-slate-500">
                  {t("settings.api.createdAt", { when: tok.createdAt.slice(0, 10) })}
                  {" · "}
                  {tok.lastUsedAt
                    ? t("settings.api.lastUsed", {
                        when: tok.lastUsedAt.slice(0, 10),
                      })
                    : t("settings.api.neverUsed")}
                </div>
              </div>
              <button
                onClick={async () => {
                  if (
                    !(await dlg.confirm({
                      message: t("settings.api.confirmRevoke", { label: tok.label }),
                      danger: true,
                    }))
                  )
                    return;
                  revoke.mutate(tok.id);
                }}
                className={btnDanger}
              >
                <Trash2 className="h-3 w-3" /> {t("settings.api.revoke")}
              </button>
            </div>
          ))}
          {(tokens.data ?? []).length === 0 && !tokens.isLoading && (
            <div className="text-sm text-slate-400">{t("settings.api.empty")}</div>
          )}
        </div>
        <p className="mt-4 text-xs text-slate-400">{t("settings.api.docsHint")}</p>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Admin                                                              */
/* ------------------------------------------------------------------ */

function Admin() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: api.adminListUsers,
  });
  const settings = useQuery({
    queryKey: ["admin-settings"],
    queryFn: api.adminGetSettings,
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
  const toggleReg = useMutation({
    mutationFn: (enabled: boolean) =>
      api.adminSetSettings({ registrationEnabled: enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
      qc.invalidateQueries({ queryKey: ["auth-config"] });
    },
  });
  const reset2fa = useMutation({
    mutationFn: (id: string) => api.adminResetUser2fa(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  // Create-user form.
  const [nu, setNu] = useState({ email: "", nickname: "", password: "" });
  const [otp, setOtp] = useState<{ email: string; password: string } | null>(
    null,
  );
  const [createErr, setCreateErr] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () =>
      api.adminCreateUser({
        email: nu.email.trim(),
        nickname: nu.nickname.trim(),
        password: nu.password.trim() || undefined,
      }),
    onSuccess: (r) => {
      setOtp({ email: r.email, password: r.oneTimePassword });
      setNu({ email: "", nickname: "", password: "" });
      setCreateErr(null);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) =>
      setCreateErr(e instanceof ApiError ? e.message : t("common.error")),
  });

  return (
    <div className="space-y-6">
      <Card>
        <SectionHeader
          icon={<ShieldCheck className="h-5 w-5" />}
          title={t("settings.admin.registrationHeading")}
          subtitle={t("settings.admin.registrationHint")}
        />
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-slate-700"
            checked={settings.data?.registrationEnabled ?? true}
            onChange={(e) => toggleReg.mutate(e.target.checked)}
            disabled={toggleReg.isPending || settings.isLoading}
          />
          <span>{t("settings.admin.registrationToggle")}</span>
        </label>
      </Card>

      <TwoFactorPolicyCard />

      <Card>
        <SectionHeader
          icon={<Plus className="h-5 w-5" />}
          title={t("settings.admin.createUserHeading")}
          subtitle={t("settings.admin.createUserHint")}
        />
        <div className="grid max-w-lg gap-2 sm:grid-cols-2">
          <input
            value={nu.email}
            onChange={(e) => setNu({ ...nu, email: e.target.value })}
            placeholder={t("settings.admin.email")}
            type="email"
            className={inputCls}
          />
          <input
            value={nu.nickname}
            onChange={(e) => setNu({ ...nu, nickname: e.target.value })}
            placeholder={t("settings.admin.nickname")}
            className={inputCls}
          />
          <input
            value={nu.password}
            onChange={(e) => setNu({ ...nu, password: e.target.value })}
            placeholder={t("settings.admin.optionalPassword")}
            className={`${inputCls} sm:col-span-2`}
          />
        </div>
        {nu.password.trim().length > 0 && nu.password.trim().length < 10 && (
          <div className="mt-1 text-sm text-amber-600 dark:text-amber-500">
            {t("settings.admin.passwordTooShort")}
          </div>
        )}
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => create.mutate()}
            disabled={
              !nu.email.trim() ||
              nu.nickname.trim().length < 3 ||
              (nu.password.trim().length > 0 && nu.password.trim().length < 10) ||
              create.isPending
            }
            className={btnPrimary}
          >
            <Plus className="h-4 w-4" /> {t("settings.admin.createUser")}
          </button>
          {createErr && <span className="text-sm text-red-600">{createErr}</span>}
        </div>

        {otp && (
          <div className="mt-4 space-y-2 rounded-lg border border-amber-300 bg-amber-50/60 p-3 dark:border-amber-900/70 dark:bg-amber-950/30">
            <p className="text-sm font-medium">
              {t("settings.admin.userCreatedTitle", { email: otp.email })}
            </p>
            <p className="text-xs text-slate-500">
              {t("settings.admin.userCreatedHint")}
            </p>
            <CopyField label={t("settings.admin.oneTimePassword")} value={otp.password} />
            <button
              onClick={() => setOtp(null)}
              className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
            >
              {t("common.close")}
            </button>
          </div>
        )}
      </Card>

      <Card>
        <SectionHeader
          icon={<Users className="h-5 w-5" />}
          title={t("settings.admin.heading")}
        />
        {users.isLoading && (
          <div className="text-slate-400">{t("common.loading")}</div>
        )}
        <div className="space-y-2">
          {(users.data ?? []).map((u) => (
          <div
            key={u.id}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800"
          >
            <div className="min-w-0 flex-1">
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
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="user">{t("settings.admin.roleUser")}</option>
              <option value="admin">{t("settings.admin.roleAdmin")}</option>
            </select>
            <button
              onClick={async () => {
                if (!(await dlg.confirm({
                  message: t("settings.admin.confirmReset2fa", { email: u.email }),
                  danger: true,
                })))
                  return;
                reset2fa.mutate(u.id);
              }}
              disabled={reset2fa.isPending}
              className={btnSecondary}
              title={t("settings.admin.reset2faHint")}
            >
              {t("settings.admin.reset2fa")}
            </button>
            <button
              onClick={async () => {
                if (!(await dlg.confirm({
                  message: t("settings.admin.confirmDeleteUser", { email: u.email }),
                  danger: true,
                })))
                  return;
                del.mutate(u.id);
              }}
              className={btnDanger}
            >
              {t("settings.admin.delete")}
            </button>
          </div>
        ))}
          {(users.data ?? []).length === 0 && !users.isLoading && (
            <div className="text-sm text-slate-400">
              {t("settings.admin.noUsers")}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function TwoFactorPolicyCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: ["admin-settings"],
    queryFn: api.adminGetSettings,
  });
  const save = useMutation({
    mutationFn: (body: {
      require2fa?: boolean;
      trustedNetworks?: string[];
      skip2faOnTrusted?: boolean;
    }) => api.adminSetSettings(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
      qc.invalidateQueries({ queryKey: ["admin-whoami"] });
    },
  });
  const whoami = useQuery({
    queryKey: ["admin-whoami"],
    queryFn: api.adminWhoami,
  });
  const [networks, setNetworks] = useState("");
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (settings.data && !seeded) {
      setNetworks(settings.data.trustedNetworks.join(", "));
      setSeeded(true);
    }
  }, [settings.data, seeded]);

  const require2fa = settings.data?.require2fa ?? false;
  const skip = settings.data?.skip2faOnTrusted ?? false;
  const parseNetworks = () =>
    networks.split(",").map((s) => s.trim()).filter(Boolean);

  return (
    <Card>
      <SectionHeader
        icon={<ShieldCheck className="h-5 w-5" />}
        title={t("settings.admin.twofaHeading")}
        subtitle={t("settings.admin.twofaHint")}
      />
      <div className="space-y-4">
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-slate-700"
            checked={require2fa}
            disabled={save.isPending || settings.isLoading}
            onChange={(e) => save.mutate({ require2fa: e.target.checked })}
          />
          <span>{t("settings.admin.require2fa")}</span>
        </label>

        <div className="space-y-1">
          <div className="text-sm font-medium">
            {t("settings.admin.trustedNetworks")}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t("settings.admin.trustedNetworksHint")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={networks}
              onChange={(e) => setNetworks(e.target.value)}
              placeholder="192.168.0.0/16, 10.0.0.0/8"
              className={`${inputCls} max-w-md flex-1`}
            />
            <button
              className={btnSecondary}
              disabled={save.isPending}
              onClick={() => save.mutate({ trustedNetworks: parseNetworks() })}
            >
              {t("common.save")}
            </button>
          </div>
          {whoami.data && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("settings.admin.detectedIp", { ip: whoami.data.ip })}{" "}
              {whoami.data.trusted ? (
                <span className="font-medium text-green-600 dark:text-green-400">
                  {t("settings.admin.ipTrusted")}
                </span>
              ) : (
                <span className="font-medium text-amber-600 dark:text-amber-500">
                  {t("settings.admin.ipNotTrusted")}
                </span>
              )}
            </p>
          )}
        </div>

        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-slate-700"
            checked={skip}
            disabled={save.isPending || settings.isLoading}
            onChange={(e) => save.mutate({ skip2faOnTrusted: e.target.checked })}
          />
          <span>{t("settings.admin.skip2faOnTrusted")}</span>
        </label>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Logs                                                               */
/* ------------------------------------------------------------------ */

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
    <Card>
      <SectionHeader
        icon={<ScrollText className="h-5 w-5" />}
        title={t("settings.logs.heading")}
        subtitle={t("settings.logs.summary", {
          errored: errored.length,
          total: all.length,
        })}
        action={
          <div className="flex flex-wrap gap-2">
            <button onClick={copyAll} disabled={all.length === 0} className={btnSecondary}>
              {t("settings.logs.copyAll")}
            </button>
            <button
              onClick={async () => {
                if (
                  !(await dlg.confirm(
                    t("settings.logs.confirmCleanErrors", { count: errored.length }),
                  ))
                )
                  return;
                purge.mutate("error");
              }}
              disabled={errored.length === 0 || purge.isPending}
              className={btnDanger}
            >
              {purge.isPending
                ? t("settings.logs.cleaning")
                : t("settings.logs.cleanErrors")}
            </button>
            <button onClick={() => jobs.refetch()} className={btnSecondary}>
              {t("settings.logs.refresh")}
            </button>
          </div>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-1">
          {t("settings.logs.statusLabel")}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="">{t("settings.logs.all")}</option>
            <option value="pending">pending</option>
            <option value="pending_user_key">pending_user_key</option>
            <option value="running">running</option>
            <option value="done">done</option>
            <option value="error">error</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          {t("settings.logs.typeLabel")}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800"
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
            className="h-3.5 w-3.5 accent-slate-700"
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
    </Card>
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
    <div className={`rounded-lg border p-3 text-sm ${cls}`}>
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
          {t("settings.logs.attemptsLabel", { count: job.attempts })} ·{" "}
          {job.userEmail}
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
