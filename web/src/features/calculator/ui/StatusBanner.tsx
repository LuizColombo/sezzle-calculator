import { AnimatePresence, motion } from "motion/react";
import styles from "./StatusBanner.module.css";

interface StatusBannerProps {
  message: string | null;
  onRetry: () => void;
}

/** Connection problems: shown above the display, with a retry. */
export function StatusBanner({ message, onRetry }: StatusBannerProps) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          role="alert"
          className={styles.banner}
          initial={{ opacity: 0, y: -12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
        >
          <span>{message}</span>
          <button type="button" className={styles.retry} onClick={onRetry}>
            Retry
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
