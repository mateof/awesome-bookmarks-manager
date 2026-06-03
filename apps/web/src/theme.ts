import { useEffect, useState } from "react";

export type ThemePref = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

export function readPreference(): ThemePref {
  if (typeof localStorage === "undefined") return "system";
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === "light" || raw === "dark" ? raw : "system";
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function applyToDom(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", dark);
}

export function setPreference(pref: ThemePref) {
  if (pref === "system") localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, pref);
  applyToDom(pref);
  window.dispatchEvent(new CustomEvent("themechange", { detail: pref }));
}

export function useTheme(): {
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
} {
  const [pref, setPref] = useState<ThemePref>(() => readPreference());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setPref(readPreference());
    };
    const onCustom = () => setPref(readPreference());
    window.addEventListener("storage", onStorage);
    window.addEventListener("themechange", onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("themechange", onCustom as EventListener);
    };
  }, []);

  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyToDom("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  return {
    pref,
    setPref: (next) => {
      setPref(next);
      setPreference(next);
    },
  };
}
