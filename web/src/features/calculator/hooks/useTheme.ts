import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

/** Same key as public/theme.js, which applies the theme before first paint. */
export const THEME_KEY = "sezzle-calculator.theme";

/** Browser chrome colour per theme; matches --color-bg in tokens.css. */
const THEME_COLOR: Record<Theme, string> = { light: "#f2f2f7", dark: "#000000" };

const DARK_QUERY = "(prefers-color-scheme: dark)";

const isTheme = (value: unknown): value is Theme => value === "light" || value === "dark";

function storedTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return typeof window.matchMedia === "function" && window.matchMedia(DARK_QUERY).matches
    ? "dark"
    : "light";
}

function initialTheme(): Theme {
  const applied = document.documentElement.dataset.theme;
  return storedTheme() ?? (isTheme(applied) ? applied : systemTheme());
}

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
}

/**
 * The colour theme. It follows the operating system until the user picks
 * one with `toggle`; the pick is remembered and wins from then on.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [chosen, setChosen] = useState(() => storedTheme() !== null);

  useEffect(() => {
    apply(theme);
  }, [theme]);

  useEffect(() => {
    if (chosen || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(DARK_QUERY);
    const onChange = () => {
      setTheme(systemTheme());
    };
    query.addEventListener("change", onChange);
    return () => {
      query.removeEventListener("change", onChange);
    };
  }, [chosen]);

  const toggle = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage unavailable: the choice lasts for this page only.
    }
    setTheme(next);
    setChosen(true);
  }, [theme]);

  return { theme, toggle };
}
