import { motion } from "motion/react";
import { useLayoutEffect, useRef } from "react";
import { toApiString, tokenText, type ExprToken, type ExpressionState } from "../model/expression";
import { displaySize, formatDisplay } from "../model/format";
import { cx } from "./cx";
import styles from "./Display.module.css";

interface DisplayProps {
  state: ExpressionState;
  /** Live result of the expression being typed, if it has arrived. */
  preview: string | null;
}

const swap = { type: "spring", stiffness: 420, damping: 36 } as const;

/** Index of the token whose API column range contains `position` (the last one if none does). */
function errorIndex(tokens: ExprToken[], position: number | null): number | null {
  if (position === null || tokens.length === 0) return null;
  const { ranges } = toApiString(tokens);
  const hit = ranges.findIndex(([start, end]) => position >= start && position < end);
  return hit === -1 ? tokens.length - 1 : hit;
}

/** Display text of one token: numbers grouped, binary operators spaced. */
const shown = (t: ExprToken) =>
  t.kind === "number" ? formatDisplay(t.text) : t.kind === "op" ? ` ${t.op} ` : tokenText(t);

/**
 * The display. While typing, the expression is the main line and the
 * preview sits below it; on "=", shared layout ids make the result grow into
 * the main line while the expression shrinks into the line above.
 */
export function Display({ state, preview }: DisplayProps) {
  const lineRef = useRef<HTMLSpanElement>(null);
  const { tokens, phase, result, error, errorPosition } = state;
  const showingResult = phase === "result" && result !== null;
  const detail = error?.kind === "api" ? (error.problem.detail ?? error.problem.title) : null;
  const marked = errorIndex(tokens, phase === "error" ? errorPosition : null);

  const expressionText = tokens.map(shown).join("") || "0";
  const mainText = showingResult ? formatDisplay(result.value) : expressionText;
  const size = displaySize(mainText);

  // Keep the end of a long expression in view as it grows.
  useLayoutEffect(() => {
    const el = lineRef.current?.parentElement;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [expressionText]);

  return (
    <section className={styles.display} aria-label="display">
      <p className={cx(styles.expression, detail !== null && styles.detail)}>
        {showingResult ? (
          <motion.span layoutId="sci-expression" transition={swap} className={styles.line}>
            {result.expression} =
          </motion.span>
        ) : (
          <span className={styles.line}>{" "}</span>
        )}
      </p>

      <output
        aria-live="polite"
        aria-atomic="true"
        aria-busy={phase === "evaluating"}
        data-size={size}
        className={cx(
          styles.value,
          styles.main,
          styles[size],
          phase === "evaluating" && styles.pending,
        )}
      >
        {showingResult ? (
          <motion.span layoutId="sci-value" transition={swap} className={styles.digits}>
            {mainText}
          </motion.span>
        ) : (
          <motion.span
            ref={lineRef}
            layoutId="sci-expression"
            transition={swap}
            className={styles.tokens}
          >
            {tokens.length === 0
              ? "0"
              : tokens.map((t, i) => (
                  <span
                    // Tokens are positional: the index is their identity.
                    key={i}
                    data-error={i === marked ? "true" : undefined}
                    className={cx(i === marked && styles.errorToken)}
                  >
                    {shown(t)}
                  </span>
                ))}
          </motion.span>
        )}
      </output>

      <p className={cx(styles.secondary, detail !== null && styles.detail)} data-testid="preview">
        {detail ??
          (!showingResult && preview !== null ? (
            <motion.span layoutId="sci-value" transition={swap}>
              {formatDisplay(preview)}
            </motion.span>
          ) : (
            " "
          ))}
      </p>
    </section>
  );
}
