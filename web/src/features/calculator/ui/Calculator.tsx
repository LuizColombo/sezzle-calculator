import { motion } from "motion/react";
import { useCallback, useRef, useState } from "react";
import type { CallOptions } from "../api/client";
import { useCalculator } from "../hooks/useCalculator";
import { useHistory } from "../hooks/useHistory";
import { useKeyboard } from "../hooks/useKeyboard";
import { useMode, type Mode } from "../hooks/useMode";
import { useScientific } from "../hooks/useScientific";
import { useTheme } from "../hooks/useTheme";
import { eventForKey, eventForScientificKey } from "../model/keymap";
import styles from "./Calculator.module.css";
import { Display } from "./Display";
import { ExpressionDisplay } from "./ExpressionDisplay";
import { HISTORY_PANEL_ID, HistoryPanel } from "./HistoryPanel";
import { Keypad } from "./Keypad";
import { BASIC_KEYS, SCIENTIFIC_KEYS } from "./keys";
import { ModeSwitch } from "./ModeSwitch";
import { StatusBanner } from "./StatusBanner";
import { ThemeToggle } from "./ThemeToggle";
import { useMediaQuery } from "./useMediaQuery";

interface CalculatorProps {
  /** Retry tuning; tests use a single attempt. */
  tuning?: Pick<CallOptions, "attempts" | "baseDelayMs">;
}

/** The inactive mode's keyboard map: captures nothing. */
const noKeys = () => null;

export function Calculator({ tuning = {} }: CalculatorProps) {
  const history = useHistory();
  const basic = useCalculator(tuning, history.add);
  const scientific = useScientific(tuning, history.add);
  const { mode, setMode } = useMode();
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyButton = useRef<HTMLButtonElement>(null);
  const narrow = useMediaQuery("(max-width: 720px)");
  const { theme, toggle: toggleTheme } = useTheme();
  const isBasic = mode === "basic";

  const closeHistory = useCallback(() => {
    setHistoryOpen(false);
    historyButton.current?.focus();
  }, []);

  // Each mode's keyboard is bound only while that mode is shown.
  useKeyboard(basic.send, isBasic ? eventForKey : noKeys);
  useKeyboard(scientific.send, isBasic ? noKeys : eventForScientificKey);

  const changeMode = (next: Mode) => {
    if (next === mode) return;
    basic.send({ type: "allClear" });
    scientific.send({ type: "allClear" });
    setMode(next);
  };

  const offline = (isBasic ? basic.state.error : scientific.state.error)?.kind === "network";

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
            <ModeSwitch mode={mode} onChange={changeMode} />
            <div className={styles.toolbarActions}>
              <a
                className={styles.toolbarLink}
                href="/docs"
                target="_blank"
                rel="noreferrer"
                aria-label="API docs"
              >
                API
              </a>
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
            onRetry={isBasic ? basic.retry : scientific.retry}
          />

          {/* Enter-only transition: the new mode is usable at once, with no exit to wait for. */}
          <motion.div
            key={mode}
            className={styles.body}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16 }}
          >
            {isBasic ? (
              <>
                <Display
                  value={basic.state.display}
                  expression={basic.state.expression}
                  pending={basic.state.phase === "awaitingResult"}
                  error={basic.state.error}
                  animationKey={String(basic.state.replaced)}
                />
                <Keypad
                  keys={BASIC_KEYS}
                  send={basic.send}
                  activeOperator={
                    basic.state.phase === "operatorChosen" ? basic.state.operator : null
                  }
                />
              </>
            ) : (
              <>
                <ExpressionDisplay state={scientific.state} preview={scientific.preview} />
                <Keypad keys={SCIENTIFIC_KEYS} send={scientific.send} />
              </>
            )}
          </motion.div>
        </motion.main>

        <HistoryPanel
          open={historyOpen}
          entries={history.entries}
          onRecall={(value) => {
            if (isBasic) basic.send({ type: "recall", value });
            else scientific.send({ type: "recall", value });
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
