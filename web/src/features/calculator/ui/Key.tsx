import { motion } from "motion/react";
import type { KeyDef } from "./keys";
import { cx } from "./cx";
import styles from "./Key.module.css";

interface KeyProps {
  def: KeyDef;
  onPress: (def: KeyDef) => void;
}

const press = { type: "spring", stiffness: 700, damping: 30, mass: 0.6 } as const;

export function Key({ def, onPress }: KeyProps) {
  const classes = cx(styles.key, styles[def.variant]);
  return (
    <motion.button
      type="button"
      className={classes}
      data-rows={def.rows}
      aria-label={def.ariaLabel}
      whileTap={{ scale: 0.92 }}
      transition={press}
      onClick={(e) => {
        // A pointer press must not leave focus on the key: Enter would then
        // re-activate it instead of meaning "=". Keyboard activation (detail 0)
        // keeps focus where the user put it.
        if (e.detail > 0) e.currentTarget.blur();
        onPress(def);
      }}
    >
      <span className={styles.label}>{def.label}</span>
    </motion.button>
  );
}
