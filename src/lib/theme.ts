import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const KEY = "bund-house-theme";

function readTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* ignore private mode */
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    setThemeState(readTheme());
  }, []);

  const setTheme = (next: Theme) => {
    applyTheme(next);
    setThemeState(next);
  };

  return { theme, setTheme };
}
