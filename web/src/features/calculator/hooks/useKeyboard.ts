import { useEffect } from "react";
import { eventForKey } from "../model/keymap";
import type { CalculatorEvent } from "../model/types";

/** Keys a focused button handles natively; intercepting them would double-fire. */
const BUTTON_KEYS = new Set(["Enter", " "]);

/** Binds the physical keyboard to the calculator while mounted. */
export function useKeyboard(send: (event: CalculatorEvent) => void) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLButtonElement && BUTTON_KEYS.has(e.key)) return;
      const event = eventForKey(e.key);
      if (!event) return;
      e.preventDefault();
      send(event);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [send]);
}
