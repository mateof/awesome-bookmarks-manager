import {
  type AutofillRuntime,
  type AutomationRunReport,
  type RunnableAutomation,
  automationMatchesUrl,
  automationScope,
  automationScriptSource,
  runAutomationSteps,
} from "@awesome-bookmarks/shared";
import { HttpError, appOrigin, fetchAutofill } from "./api.js";
import { loadConfig } from "./storage.js";

const BRIDGE_ID = "ab-bridge";
const STALE_MS = 5 * 60_000;
const LOAD_TIMEOUT_MS = 60_000;

interface CachedRuntime {
  at: number;
  runtime: AutofillRuntime | null;
  error: string | null;
}

let cache: CachedRuntime | null = null;
const claimedTabs = new Set<number>();

interface UserScriptsApi {
  getScripts: () => Promise<unknown>;
  execute?: (injection: {
    target: { tabId: number };
    js: Array<{ code: string }>;
    world?: "USER_SCRIPT" | "MAIN";
  }) => Promise<unknown>;
}

function userScriptsApi(): UserScriptsApi | null {
  const api = (chrome as unknown as { userScripts?: UserScriptsApi }).userScripts;
  if (!api) return null;
  try {
    void api.getScripts().catch(() => undefined);
    return api;
  } catch {
    return null;
  }
}

export function userScriptsStatus(): "ready" | "disabled" | "unsupported" {
  const api = userScriptsApi();
  if (!api) return "disabled";
  return typeof api.execute === "function" ? "ready" : "unsupported";
}

export async function loadRuntime(maxAgeMs: number): Promise<CachedRuntime> {
  if (cache && Date.now() - cache.at < maxAgeMs) return cache;
  const cfg = await loadConfig();
  if (!cfg) {
    cache = { at: Date.now(), runtime: null, error: "not-configured" };
    return cache;
  }
  try {
    cache = { at: Date.now(), runtime: await fetchAutofill(cfg), error: null };
  } catch (e) {
    const error =
      e instanceof HttpError && e.status === 403
        ? "Este token no tiene permiso de autorrelleno"
        : e instanceof Error
          ? e.message
          : String(e);
    cache = { at: Date.now(), runtime: null, error };
  }
  return cache;
}

export function forgetRuntime() {
  cache = null;
}

function waitForLoad(tabId: number): Promise<chrome.tabs.Tab> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("La página no terminó de cargar"));
    }, LOAD_TIMEOUT_MS);
    const finish = (tab: chrome.tabs.Tab) => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(tab);
    };
    const listener = (id: number, info: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      if (id === tabId && info.status === "complete") finish(tab);
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs
      .get(tabId)
      .then((tab) => {
        if (tab.status === "complete" && tab.url && tab.url !== "about:blank") finish(tab);
      })
      .catch(() => undefined);
  });
}

async function badge(tabId: number, ok: boolean, title: string) {
  try {
    await chrome.action.setBadgeText({ tabId, text: ok ? "✓" : "!" });
    await chrome.action.setBadgeBackgroundColor({
      tabId,
      color: ok ? "#059669" : "#dc2626",
    });
    await chrome.action.setTitle({ tabId, title: `AwesomeBookmarks · ${title}` });
  } catch {
    return;
  }
}

export async function runInTab(
  tabId: number,
  automation: RunnableAutomation,
  variables: Record<string, string>,
): Promise<AutomationRunReport> {
  const tab = await chrome.tabs.get(tabId);
  const expected = automationScope(automation.url)?.origin;
  const actual = tab.url ? automationScope(tab.url)?.origin : undefined;
  if (!expected || expected !== actual) {
    const report = {
      ok: false,
      done: 0,
      total: automation.steps.length,
      error: `La pestaña está en ${actual ?? "otra página"}, no en ${expected}`,
    };
    await badge(tabId, false, report.error);
    return report;
  }

  let report: AutomationRunReport = { ok: true, done: 0, total: 0 };
  if (automation.steps.length > 0) {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: runAutomationSteps,
      args: [{ steps: automation.steps, vars: variables, timeoutMs: automation.timeoutMs }],
    });
    report = (result?.result as AutomationRunReport | undefined) ?? {
      ok: false,
      done: 0,
      total: automation.steps.length,
      error: "Sin respuesta de la página",
    };
  }

  if (report.ok && automation.script.trim()) {
    const status = userScriptsStatus();
    const api = userScriptsApi();
    if (status === "ready" && api?.execute) {
      try {
        await api.execute({
          target: { tabId },
          js: [{ code: automationScriptSource(automation.script, variables) }],
          world: "USER_SCRIPT",
        });
      } catch (e) {
        report = { ...report, ok: false, error: `Script: ${e instanceof Error ? e.message : e}` };
      }
    } else {
      report = {
        ...report,
        ok: false,
        error:
          status === "disabled"
            ? "El script necesita «Permitir scripts de usuario» en los detalles de la extensión"
            : "El script necesita Chrome 135 o posterior",
      };
    }
  }

  const title = report.ok
    ? `Autorrelleno: ${report.done}/${report.total} pasos`
    : `Autorrelleno: ${report.error ?? "falló"}`;
  await badge(tabId, report.ok, title);
  return report;
}

export async function openBookmark(
  bookmarkId: string,
  fallbackUrl: string | null,
  active: boolean,
  openerTabId: number | undefined,
) {
  const loaded = await loadRuntime(0);
  const automation = loaded.runtime?.automations.find((a) => a.bookmarkId === bookmarkId);
  const target = automation?.url ?? (fallbackUrl && automationScope(fallbackUrl) ? fallbackUrl : null);
  if (!target) return;
  const tab = await chrome.tabs.create({
    url: target,
    active,
    ...(openerTabId !== undefined ? { openerTabId } : {}),
  });
  if (!automation || tab.id === undefined) {
    if (tab.id !== undefined && loaded.error) await badge(tab.id, false, loaded.error);
    return;
  }
  claimedTabs.add(tab.id);
  try {
    await waitForLoad(tab.id);
    await runInTab(tab.id, automation, loaded.runtime!.variables);
  } catch (e) {
    await badge(tab.id, false, e instanceof Error ? e.message : String(e));
  } finally {
    claimedTabs.delete(tab.id);
  }
}

export async function onTabLoaded(tabId: number, url: string | undefined) {
  if (!url || claimedTabs.has(tabId) || !automationScope(url)) return;
  const loaded = await loadRuntime(STALE_MS);
  const candidates = (loaded.runtime?.automations ?? [])
    .filter((a) => a.trigger === "always" && automationMatchesUrl(a.url, url))
    .sort((a, b) => b.url.length - a.url.length);
  const automation = candidates[0];
  if (!automation) return;
  await runInTab(tabId, automation, loaded.runtime!.variables);
}

export async function ensureBridge() {
  const cfg = await loadConfig();
  const origin = cfg ? appOrigin(cfg) : null;
  const registered = await chrome.scripting
    .getRegisteredContentScripts({ ids: [BRIDGE_ID] })
    .catch(() => []);
  const wanted = origin ? [`${origin}/*`] : null;
  const current = registered[0]?.matches ?? null;
  if (JSON.stringify(current) === JSON.stringify(wanted)) return;
  if (registered.length > 0) {
    await chrome.scripting.unregisterContentScripts({ ids: [BRIDGE_ID] });
  }
  if (wanted) {
    await chrome.scripting.registerContentScripts([
      {
        id: BRIDGE_ID,
        matches: wanted,
        js: ["bridge.js"],
        runAt: "document_start",
        persistAcrossSessions: true,
      },
    ]);
  }
}

export async function isFromApp(senderUrl: string | undefined): Promise<boolean> {
  const cfg = await loadConfig();
  const origin = cfg ? appOrigin(cfg) : null;
  if (!origin || !senderUrl) return false;
  try {
    return new URL(senderUrl).origin === origin;
  } catch {
    return false;
  }
}
