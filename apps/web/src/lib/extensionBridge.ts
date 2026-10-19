import { useQuery } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { api } from "../api.js";

const READY_ATTR = "abExtension";

let routes = new Map<string, string>();

function normalize(url: string): string | null {
  try {
    const u = new URL(url, window.location.href);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    return u.href;
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [`data-ab-extension`],
  });
  return () => observer.disconnect();
}

export function extensionAvailable(): boolean {
  return !!document.documentElement.dataset[READY_ATTR];
}

export function useExtensionAvailable(): boolean {
  return useSyncExternalStore(subscribe, extensionAvailable, () => false);
}

export function automatedBookmarkFor(url: string): string | null {
  const key = normalize(url);
  return key ? (routes.get(key) ?? null) : null;
}

export function openThroughExtension(bookmarkId: string, url: string, active: boolean) {
  window.postMessage(
    { source: "ab-web", type: "open-bookmark", bookmarkId, url, active },
    window.location.origin,
  );
}

export function notifyAutomationsChanged() {
  if (!extensionAvailable()) return;
  window.postMessage(
    { source: "ab-web", type: "automations-changed" },
    window.location.origin,
  );
}

export function openExternal(url: string, features = "noopener,noreferrer") {
  const bookmarkId = extensionAvailable() ? automatedBookmarkFor(url) : null;
  if (bookmarkId) {
    openThroughExtension(bookmarkId, url, true);
    return;
  }
  window.open(url, "_blank", features);
}

function interceptedAnchor(event: MouseEvent): { anchor: HTMLAnchorElement; bookmarkId: string } | null {
  if (event.defaultPrevented || !extensionAvailable()) return null;
  if (event.type === "click" && event.button !== 0) return null;
  if (event.type === "auxclick" && event.button !== 1) return null;
  const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!anchor) return null;
  const opensElsewhere =
    anchor.target === "_blank" ||
    event.type === "auxclick" ||
    event.ctrlKey ||
    event.metaKey;
  if (!opensElsewhere) return null;
  const bookmarkId = automatedBookmarkFor(anchor.href);
  return bookmarkId ? { anchor, bookmarkId } : null;
}

export function useAutomationLinks() {
  const available = useExtensionAvailable();
  const summaries = useQuery({
    queryKey: ["automation-summaries"],
    queryFn: api.listAutomations,
    enabled: available,
    staleTime: 30_000,
  });

  useEffect(() => {
    const next = new Map<string, string>();
    for (const s of summaries.data ?? []) {
      if (!s.enabled || s.status !== "approved" || s.trigger !== "open") continue;
      const key = normalize(s.url);
      if (key && !next.has(key)) next.set(key, s.bookmarkId);
    }
    routes = next;
  }, [summaries.data]);

  useEffect(() => {
    if (!available) return;
    const onClick = (event: MouseEvent) => {
      const hit = interceptedAnchor(event);
      if (!hit) return;
      event.preventDefault();
      event.stopPropagation();
      const background = event.type === "auxclick" || event.ctrlKey || event.metaKey;
      openThroughExtension(hit.bookmarkId, hit.anchor.href, !background);
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("auxclick", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("auxclick", onClick, true);
    };
  }, [available]);
}
