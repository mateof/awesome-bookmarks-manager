import { useEffect, useState } from "react";

export type ViewMode = "grid" | "list" | "large" | "table" | "mosaic";

const STORAGE_KEY = "viewMode";
const VALID: ViewMode[] = ["grid", "list", "large", "table", "mosaic"];

function read(): ViewMode {
  if (typeof localStorage === "undefined") return "grid";
  const raw = localStorage.getItem(STORAGE_KEY);
  return VALID.includes(raw as ViewMode) ? (raw as ViewMode) : "grid";
}

export function useViewMode(): {
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
} {
  const [mode, setModeState] = useState<ViewMode>(() => read());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setModeState(read());
    };
    const onCustom = () => setModeState(read());
    window.addEventListener("storage", onStorage);
    window.addEventListener("viewmodechange", onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("viewmodechange", onCustom as EventListener);
    };
  }, []);

  return {
    mode,
    setMode: (next) => {
      localStorage.setItem(STORAGE_KEY, next);
      setModeState(next);
      window.dispatchEvent(new CustomEvent("viewmodechange", { detail: next }));
    },
  };
}
