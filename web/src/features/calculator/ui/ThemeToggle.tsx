import { AnimatePresence, motion } from "motion/react";
import type { Theme } from "../hooks/useTheme";
import styles from "./ThemeToggle.module.css";

interface ThemeToggleProps {
  theme: Theme;
  onToggle: () => void;
}

/** Sun in dark mode, moon in light mode: the icon shows where a press takes you. */
export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className={styles.toggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      onClick={onToggle}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={theme}
          className={styles.icon}
          initial={{ opacity: 0, rotate: -90, scale: 0.6 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 90, scale: 0.6 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4.5" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
      </g>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M20.5 14.6A8.5 8.5 0 1 1 9.4 3.5a7 7 0 0 0 11.1 11.1Z" fill="currentColor" />
    </svg>
  );
}
