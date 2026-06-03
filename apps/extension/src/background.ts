import { quickAdd } from "./api.js";
import { loadConfig } from "./storage.js";

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
    await quickAdd(cfg, { url: tab.url, title: tab.title ?? undefined });
    chrome.action.setBadgeText({ text: "✓", tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: "#059669", tabId: tab.id });
    setTimeout(() => chrome.action.setBadgeText({ text: "", tabId: tab.id }), 2000);
  } catch {
    chrome.action.setBadgeText({ text: "!", tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: "#dc2626", tabId: tab.id });
  }
});
