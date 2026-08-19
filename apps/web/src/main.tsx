import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.js";
import "./i18n/index.js";
import "./index.css";
import { initTheme } from "./themes.js";

// The boot script in index.html paints a cached copy; this is the authoritative
// pass, so a built-in palette changed by an update reaches an old cache.
initTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

/**
 * Register the service worker so the browser treats the app as installable —
 * which is what makes it appear in Android's share sheet as a target. Dev is
 * skipped: Vite already owns module reloading and a worker in the middle only
 * confuses it.
 */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      // Not fatal: without it the app still works, it just cannot be installed.
      console.warn("service worker registration failed", err);
    });
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
