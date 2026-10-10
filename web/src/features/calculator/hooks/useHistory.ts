import { useCallback, useEffect, useState } from "react";

/** Versioned so a future change of shape can ignore old data instead of crashing. */
export const HISTORY_KEY = "sezzle-calculator.history.v1";
const MAX_ENTRIES = 50;

export interface HistoryEntry {
  expression: string;
  result: string;
  /** Epoch milliseconds. */
  at: number;
}

const isEntry = (value: unknown): value is HistoryEntry =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as HistoryEntry).expression === "string" &&
  typeof (value as HistoryEntry).result === "string" &&
  typeof (value as HistoryEntry).at === "number";

function load(): HistoryEntry[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(HISTORY_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isEntry).slice(0, MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

function save(entries: HistoryEntry[]) {
  try {
    if (entries.length === 0) window.localStorage.removeItem(HISTORY_KEY);
    else window.localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch {
    // Storage full or disabled (e.g. private mode): history stays in memory.
  }
}

/** The last 50 calculations, newest first, persisted in localStorage. */
export function useHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>(load);

  useEffect(() => {
    save(entries);
  }, [entries]);

  const add = useCallback((entry: Omit<HistoryEntry, "at">) => {
    setEntries((previous) => [{ ...entry, at: Date.now() }, ...previous].slice(0, MAX_ENTRIES));
  }, []);

  const clear = useCallback(() => {
    setEntries([]);
  }, []);

  return { entries, add, clear };
}
