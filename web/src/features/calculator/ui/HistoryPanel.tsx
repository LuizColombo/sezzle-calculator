import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { HistoryEntry } from "../hooks/useHistory";
import { formatDisplay } from "../model/format";
import { cx } from "./cx";
import styles from "./HistoryPanel.module.css";
import { useMediaQuery } from "./useMediaQuery";

interface HistoryPanelProps {
  open: boolean;
  entries: HistoryEntry[];
  onRecall: (result: string) => void;
  onClear: () => void;
  onClose: () => void;
}

const CONFIRM_MS = 4000;
const TITLE_ID = "history-title";
export const HISTORY_PANEL_ID = "history-panel";
const sheet = { type: "spring", stiffness: 380, damping: 36 } as const;

/** Side panel on wide screens, bottom sheet on phones. */
export function HistoryPanel({ open, entries, onRecall, onClear, onClose }: HistoryPanelProps) {
  const narrow = useMediaQuery("(max-width: 720px)");
  return (
    <AnimatePresence>
      {open && (
        <>
          {narrow && (
            <motion.button
              key="scrim"
              type="button"
              className={styles.scrim}
              aria-label="Close history"
              tabIndex={-1}
              onClick={onClose}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
          )}
          <motion.aside
            key="panel"
            id={HISTORY_PANEL_ID}
            aria-labelledby={TITLE_ID}
            {...(narrow ? { role: "dialog", "aria-modal": true } : {})}
            className={cx(styles.panel, narrow ? styles.sheet : styles.side)}
            initial={narrow ? { y: "100%" } : { opacity: 0, x: 24 }}
            animate={narrow ? { y: 0 } : { opacity: 1, x: 0 }}
            exit={narrow ? { y: "100%" } : { opacity: 0, x: 24 }}
            transition={sheet}
          >
            <PanelContent
              entries={entries}
              onRecall={onRecall}
              onClear={onClear}
              onClose={onClose}
            />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function PanelContent({ entries, onRecall, onClear, onClose }: Omit<HistoryPanelProps, "open">) {
  const [confirming, setConfirming] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Move focus into the panel when it opens, so keyboard users land in it.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Escape closes the panel instead of clearing the calculator.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [onClose]);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => {
      setConfirming(false);
    }, CONFIRM_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [confirming]);

  return (
    <>
      <header className={styles.header}>
        <h2 id={TITLE_ID} className={styles.title}>
          History
        </h2>
        <div className={styles.actions}>
          {entries.length > 0 &&
            (confirming ? (
              <>
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={() => {
                    setConfirming(false);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={cx(styles.textButton, styles.danger)}
                  aria-label="Clear all history"
                  onClick={() => {
                    setConfirming(false);
                    onClear();
                  }}
                >
                  Clear all
                </button>
              </>
            ) : (
              <button
                type="button"
                className={styles.textButton}
                onClick={() => {
                  setConfirming(true);
                }}
              >
                Clear
              </button>
            ))}
          <button ref={closeRef} type="button" className={styles.textButton} onClick={onClose}>
            Done
          </button>
        </div>
      </header>

      {entries.length === 0 ? (
        <p className={styles.empty}>No calculations yet.</p>
      ) : (
        <ul className={styles.list}>
          <AnimatePresence initial={false}>
            {entries.map((entry) => (
              <motion.li
                key={`${String(entry.at)}:${entry.expression}`}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <button
                  type="button"
                  className={styles.entry}
                  onClick={() => {
                    onRecall(entry.result);
                    onClose();
                  }}
                >
                  <span className={styles.entryExpression}>{entry.expression}</span>
                  <span className={styles.entryResult}>{formatDisplay(entry.result)}</span>
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </>
  );
}
