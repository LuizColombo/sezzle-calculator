import { useCallback, useState } from "react";
import type { CallOptions } from "../api/client";
import { useCalculator } from "../hooks/useCalculator";
import { useKeyboard } from "../hooks/useKeyboard";
import type { CalculatorEvent, CalculatorState } from "../model/types";
import styles from "./Calculator.module.css";
import { Display } from "./Display";
import { HistoryPanel } from "./HistoryPanel";
import { Keypad } from "./Keypad";
import { StatusBanner } from "./StatusBanner";

interface CalculatorProps {
  /** Retry tuning; tests use a single attempt. */
  tuning?: Pick<CallOptions, "attempts" | "baseDelayMs">;
}

/**
 * Key for the display's enter/exit transition: it changes when the value is
 * replaced (a result or error arrives, or the display is cleared) and stays
 * put while the user edits the current operand.
 */
function displayAnimationKey(state: CalculatorState, clears: number): string {
  if (state.phase === "result" || state.phase === "error") {
    return `${state.phase}:${state.expression ?? ""}:${state.display}`;
  }
  return `input:${String(clears)}`;
}

export function Calculator({ tuning = {} }: CalculatorProps) {
  const { state, send, retry, history } = useCalculator(tuning);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [clears, setClears] = useState(0);

  const sendEvent = useCallback(
    (event: CalculatorEvent) => {
      if (event.type === "allClear") setClears((n) => n + 1);
      send(event);
    },
    [send],
  );
  const closeHistory = useCallback(() => {
    setHistoryOpen(false);
  }, []);

  useKeyboard(sendEvent);

  const offline = state.error?.kind === "network";

  return (
    <div className={styles.layout}>
      <main className={styles.card}>
        <h1 className={styles.visuallyHidden}>Sezzle Calculator</h1>
        <nav className={styles.toolbar} aria-label="Calculator">
          <a className={styles.toolbarLink} href="/docs" target="_blank" rel="noreferrer">
            API docs
          </a>
          <button
            type="button"
            className={styles.toolbarButton}
            aria-expanded={historyOpen}
            onClick={() => {
              setHistoryOpen((open) => !open);
            }}
          >
            <ClockIcon />
            History
          </button>
        </nav>

        <StatusBanner
          message={offline ? "Can’t reach the calculation service." : null}
          onRetry={retry}
        />

        <Display
          value={state.display}
          expression={state.expression}
          pending={state.phase === "awaitingResult"}
          error={state.error}
          animationKey={displayAnimationKey(state, clears)}
        />

        <Keypad
          send={sendEvent}
          activeOperator={state.phase === "operatorChosen" ? state.operator : null}
        />
      </main>

      <HistoryPanel
        open={historyOpen}
        entries={history.entries}
        onRecall={(value) => {
          sendEvent({ type: "recall", value });
        }}
        onClear={history.clear}
        onClose={closeHistory}
      />
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
