import { motion } from "motion/react";
import { useRef, type KeyboardEvent } from "react";
import type { Mode } from "../hooks/useMode";
import { cx } from "./cx";
import styles from "./ModeSwitch.module.css";

const MODES: { value: Mode; label: string }[] = [
  { value: "basic", label: "Basic" },
  { value: "scientific", label: "Scientific" },
];

interface ModeSwitchProps {
  mode: Mode;
  onChange: (mode: Mode) => void;
}

/**
 * A segmented control. Semantically a radio group: one tab stop, arrow keys
 * move the selection (WAI-ARIA radio group pattern).
 */
export function ModeSwitch({ mode, onChange }: ModeSwitchProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0) return;
    e.preventDefault();
    const next = (index + step + MODES.length) % MODES.length;
    const target = MODES[next];
    if (!target) return;
    onChange(target.value);
    refs.current[next]?.focus();
  };

  return (
    <div className={styles.switch} role="radiogroup" aria-label="Mode">
      {MODES.map(({ value, label }, index) => {
        const checked = value === mode;
        return (
          <button
            key={value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            className={cx(styles.option, checked && styles.checked)}
            onClick={(e) => {
              // As with keypad keys: a pointer click must not keep focus here,
              // or the next Enter would re-press the switch instead of "=".
              if (e.detail > 0) e.currentTarget.blur();
              onChange(value);
            }}
            onKeyDown={(e) => {
              onKeyDown(e, index);
            }}
          >
            {checked && (
              <motion.span
                layoutId="mode-thumb"
                className={styles.thumb}
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <span className={styles.label}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
