import { useEffect } from "react";
import { eventForKey } from "../model/keymap";
import type { CalculatorEvent } from "../model/types";

/** Keys a focused button handles natively; intercepting them would double-fire. */
const BUTTON_KEYS = new Set(["Enter", " "]);

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement ||
  (target instanceof HTMLElement && target.isContentEditable);

/** Binds the physical keyboard to the calculator while mounted. */
export function useKeyboard<E = CalculatorEvent>(
  send: (event: E) => void,
  /** Maps KeyboardEvent.key to the active mode's event; Basic's map by default. */
  map: (key: string) => E | null = eventForKey as (key: string) => E | null,
) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLButtonElement && BUTTON_KEYS.has(e.key)) return;
      if (isEditable(e.target)) return;
      const event = map(e.key);
      if (!event) return;
      e.preventDefault();
      send(event);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [send, map]);
}
