import { useCallback, useState } from "react";

export type Mode = "basic" | "scientific";

export const MODE_KEY = "sezzle-calculator.mode.v1";

const isMode = (value: unknown): value is Mode => value === "basic" || value === "scientific";

function storedMode(): Mode {
  try {
    const value = window.localStorage.getItem(MODE_KEY);
    return isMode(value) ? value : "basic";
  } catch {
    return "basic";
  }
}

/** Basic (immediate execution) or Scientific (precedence), remembered across visits. */
export function useMode() {
  const [mode, setModeState] = useState<Mode>(storedMode);

  const setMode = useCallback((next: Mode) => {
    try {
      window.localStorage.setItem(MODE_KEY, next);
    } catch {
      // Storage unavailable: the choice lasts for this page only.
    }
    setModeState(next);
  }, []);

  return { mode, setMode };
}
