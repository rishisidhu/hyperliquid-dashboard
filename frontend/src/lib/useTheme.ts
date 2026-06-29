"use client";

import { useEffect, useState } from "react";
import type { Theme } from "./types";

// Theme state. Default is DARK (the terminal aesthetic is the brand); light is
// opt-in via the toggle and persisted in localStorage. A pre-paint inline script
// (layout.tsx) sets <html data-theme> before hydration so CSS tokens are correct
// from the first frame; this hook owns it after mount and drives the JS skew ramp.
export function useTheme(): { theme: Theme; toggle: () => void } {
  // SSR-safe deterministic default; the stored choice is read on mount.
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("theme");
      if (stored === "light" || stored === "dark") setTheme(stored);
    } catch {
      /* localStorage unavailable — stay on default */
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggle = () =>
    setTheme((t) => {
      const next: Theme = t === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("theme", next);
      } catch {
        /* ignore */
      }
      return next;
    });

  return { theme, toggle };
}
