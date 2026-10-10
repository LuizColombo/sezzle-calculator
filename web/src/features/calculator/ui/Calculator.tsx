import { motion } from "motion/react";
import { useCallback, useRef, useState } from "react";
import type { CallOptions } from "../api/client";
import { useCalculator } from "../hooks/useCalculator";
import { useHistory } from "../hooks/useHistory";
import { useKeyboard } from "../hooks/useKeyboard";
import { useTheme } from "../hooks/useTheme";
import styles from "./Calculator.module.css";
import { Display } from "./Display";
import { HISTORY_PANEL_ID, HistoryPanel } from "./HistoryPanel";
import { Keypad } from "./Keypad";
import { BASIC_KEYS } from "./keys";
import { StatusBanner } from "./StatusBanner";
import { ThemeToggle } from "./ThemeToggle";
import { useMediaQuery } from "./useMediaQuery";

interface CalculatorProps {
  /** Retry tuning; tests use a single attempt. */
  tuning?: Pick<CallOptions, "attempts" | "baseDelayMs">;
}

export function Calculator({ tuning = {} }: CalculatorProps) {
  const history = useHistory();
  const { state, send, retry } = useCalculator(tuning, history.add);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyButton = useRef<HTMLButtonElement>(null);
  const narrow = useMediaQuery("(max-width: 720px)");
  const { theme, toggle: toggleTheme } = useTheme();

  const closeHistory = useCallback(() => {
    setHistoryOpen(false);
    historyButton.current?.focus();
  }, []);

  useKeyboard(send);

  const offline = state.error?.kind === "network";

  return (
    <div className={styles.layout}>
      <div className={styles.stage}>
        <motion.main
          layout="position"
          transition={{ type: "spring", stiffness: 380, damping: 36 }}
          className={styles.card}
          // On phones the history sheet covers the calculator: take it out of the
          // tab order and the accessibility tree while the sheet is open.
          inert={narrow && historyOpen}
        >
          <h1 className="visually-hidden">Sezzle Calculator</h1>
          <div className={styles.toolbar}>
            <a className={styles.toolbarLink} href="/docs" target="_blank" rel="noreferrer">
              API docs
            </a>
            <div className={styles.toolbarActions}>
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
              <button
                ref={historyButton}
                type="button"
                className={styles.toolbarButton}
                aria-expanded={historyOpen}
                aria-controls={HISTORY_PANEL_ID}
                onClick={() => {
                  setHistoryOpen((open) => !open);
                }}
              >
                <ClockIcon />
                History
              </button>
            </div>
          </div>

          <StatusBanner
            message={offline ? "Can’t reach the calculation service." : null}
            onRetry={retry}
          />

          <Display
            value={state.display}
            expression={state.expression}
            pending={state.phase === "awaitingResult"}
            error={state.error}
            animationKey={String(state.replaced)}
          />

          <Keypad
            keys={BASIC_KEYS}
            send={send}
            activeOperator={state.phase === "operatorChosen" ? state.operator : null}
          />
        </motion.main>

        <HistoryPanel
          open={historyOpen}
          entries={history.entries}
          onRecall={(value) => {
            send({ type: "recall", value });
          }}
          onClear={history.clear}
          onClose={closeHistory}
        />
      </div>
    </div>
  );
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 7v5l3 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
