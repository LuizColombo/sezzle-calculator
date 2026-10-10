import { AnimatePresence, motion } from "motion/react";
import { displaySize, formatDisplay } from "../model/format";
import type { CalculatorError } from "../model/types";
import { cx } from "./cx";
import styles from "./Display.module.css";

interface DisplayProps {
  value: string;
  expression: string | null;
  pending: boolean;
  error: CalculatorError | null;
  /**
   * Changes when the value is replaced rather than edited (a result arrives,
   * or the display is cleared), which plays the enter/exit transition.
   */
  animationKey: string;
}

const spring = { type: "spring", stiffness: 420, damping: 34 } as const;

export function Display({ value, expression, pending, error, animationKey }: DisplayProps) {
  const formatted = formatDisplay(value);
  const size = displaySize(formatted);
  const detail = error?.kind === "api" ? (error.problem.detail ?? error.problem.title) : null;
  const line = detail ?? expression;

  return (
    <section className={styles.display} aria-label="display">
      <p className={cx(styles.expression, detail !== null && styles.detail)}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={line ?? ""}
            className={styles.line}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {line ?? " "}
          </motion.span>
        </AnimatePresence>
      </p>

      <output
        aria-live="polite"
        aria-atomic="true"
        aria-busy={pending}
        data-size={size}
        className={cx(styles.value, styles[size], error && styles.error, pending && styles.pending)}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={animationKey}
            className={styles.digits}
            initial={{ opacity: 0, y: 28, filter: "blur(6px)" }}
            animate={
              error?.kind === "api"
                ? { opacity: 1, y: 0, filter: "blur(0px)", x: [0, -10, 8, -5, 3, 0] }
                : { opacity: 1, y: 0, filter: "blur(0px)", x: 0 }
            }
            exit={{ opacity: 0, y: -18, filter: "blur(8px)", scale: 0.96 }}
            // Keyframed shake needs a tween; springs only interpolate two values.
            transition={{ ...spring, x: { duration: 0.4, ease: "easeInOut" } }}
          >
            {formatted}
          </motion.span>
        </AnimatePresence>
      </output>
    </section>
  );
}
