import type { PublicPanelResponse } from "@awesome-bookmarks/shared";
import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, api } from "../api.js";
import { PanelRenderer } from "../components/PanelRenderer.js";

/** Emoji → inline SVG favicon data URL. */
function emojiFaviconDataUrl(emoji: string): string {
  const safe = emoji.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-size="82">${safe}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Set the browser tab title/favicon while a panel is open; restore on leave. */
function usePanelTabMeta(resp: PublicPanelResponse | undefined) {
  const title = resp ? resp.tabTitle?.trim() || resp.displayTitle?.trim() || resp.title : "";
  const favicon = resp?.faviconEmoji?.trim() || "";
  useEffect(() => {
    if (!title && !favicon) return;
    const prevTitle = document.title;
    if (title) document.title = title;
    const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    const prevHref = link?.getAttribute("href") ?? null;
    const prevType = link?.getAttribute("type") ?? null;
    if (favicon && link) {
      link.setAttribute("type", "image/svg+xml");
      link.setAttribute("href", emojiFaviconDataUrl(favicon));
    }
    return () => {
      document.title = prevTitle;
      if (link) {
        if (prevType !== null) link.setAttribute("type", prevType);
        if (prevHref !== null) link.setAttribute("href", prevHref);
      }
    };
  }, [title, favicon]);
}

export function PublicPanelPage() {
  const { slug } = useParams<{ slug: string }>();
  const [unlocked, setUnlocked] = useState<PublicPanelResponse | null>(null);
  const q = useQuery({
    queryKey: ["public-panel", slug],
    queryFn: () => api.getPublicPanel(slug!),
    enabled: !!slug,
    retry: false,
  });

  const resp = unlocked ?? q.data;
  usePanelTabMeta(resp);

  if (q.isLoading) {
    return <Centered>Cargando…</Centered>;
  }
  if (q.isError && !unlocked) {
    return <Centered>Este panel no existe o no está disponible.</Centered>;
  }
  if (!resp) return <Centered>…</Centered>;

  if (resp.root) {
    return (
      <PanelRenderer
        root={resp.root}
        template={resp.template}
        displayTitle={resp.displayTitle}
      />
    );
  }
  if (resp.needsPassword) {
    return <PasswordGate slug={slug!} title={resp.title} onUnlock={setUnlocked} />;
  }
  if (resp.needsAuth) {
    return (
      <Centered>
        <div className="space-y-3 text-center">
          <Lock className="mx-auto h-8 w-8 text-slate-400" />
          <p className="text-slate-600 dark:text-slate-300">
            Este panel es privado. Inicia sesión para verlo.
          </p>
          <Link
            to="/login"
            className="inline-block rounded bg-slate-900 px-4 py-2 text-sm text-white dark:bg-slate-100 dark:text-slate-900"
          >
            Iniciar sesión
          </Link>
        </div>
      </Centered>
    );
  }
  return <Centered>No tienes acceso a este panel.</Centered>;
}

function PasswordGate({
  slug,
  title,
  onUnlock,
}: {
  slug: string;
  title: string;
  onUnlock: (r: PublicPanelResponse) => void;
}) {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Centered>
      <form
        className="w-80 space-y-3 rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          try {
            const r = await api.unlockPublicPanel(slug, password);
            onUnlock(r);
          } catch (e) {
            setErr(e instanceof ApiError ? e.message : "Error");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-slate-400" />
          <h1 className="text-lg font-semibold">{title}</h1>
        </div>
        <p className="text-sm text-slate-500">Este panel requiere contraseña.</p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña"
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
        />
        {err && <div className="text-sm text-red-600">{err}</div>}
        <button
          type="submit"
          disabled={busy || !password}
          className="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {busy ? "…" : "Ver panel"}
        </button>
      </form>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 text-slate-500 dark:bg-slate-950">
      {children}
    </div>
  );
}
