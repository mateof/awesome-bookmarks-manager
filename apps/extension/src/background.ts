import { quickAdd } from "./api.js";
import { ensureBridge, forgetRuntime, isFromApp, onTabLoaded, openBookmark } from "./autofill.js";
import { getLastFolderId, loadConfig } from "./storage.js";

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "save-tab") return;
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.url) return;

  const cfg = await loadConfig();
  if (!cfg) {
    chrome.runtime.openOptionsPage();
    return;
  }

  try {
    await quickAdd(cfg, {
      url: tab.url,
      title: tab.title ?? undefined,
      folderId: await getLastFolderId(),
    });
    chrome.action.setBadgeText({ text: "✓", tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: "#059669", tabId: tab.id });
    setTimeout(() => chrome.action.setBadgeText({ text: "", tabId: tab.id }), 2000);
  } catch {
    chrome.action.setBadgeText({ text: "!", tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: "#dc2626", tabId: tab.id });
  }
});

chrome.runtime.onInstalled.addListener(() => void ensureBridge());
chrome.runtime.onStartup.addListener(() => void ensureBridge());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || (!changes.endpoint && !changes.token)) return;
  forgetRuntime();
  void ensureBridge();
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "open-bookmark" && typeof message.bookmarkId === "string") {
    void isFromApp(sender.url).then((trusted) => {
      if (!trusted) return;
      void openBookmark(
        message.bookmarkId,
        typeof message.url === "string" ? message.url : null,
        message.active !== false,
        sender.tab?.id,
      );
    });
  }
  if (message?.type === "autofill-changed") forgetRuntime();
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === "complete") void onTabLoaded(tabId, tab.url);
});
