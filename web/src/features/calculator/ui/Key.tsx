import { motion } from "motion/react";
import type { KeyDef } from "./keys";
import { cx } from "./cx";
import styles from "./Key.module.css";

interface KeyProps {
  def: KeyDef;
  /** Only meaningful for operator keys: the operator waiting for its second operand. */
  active: boolean;
  onPress: (def: KeyDef) => void;
}

const press = { type: "spring", stiffness: 700, damping: 30, mass: 0.6 } as const;

export function Key({ def, active, onPress }: KeyProps) {
  const isOperator = def.operator !== undefined && def.variant === "operator";
  const classes = cx(styles.key, styles[def.variant], active && styles.active);
  return (
    <motion.button
      type="button"
      className={classes}
      data-columns={def.columns}
      data-rows={def.rows}
      aria-label={def.ariaLabel}
      aria-pressed={isOperator ? active : undefined}
      whileTap={{ scale: 0.92 }}
      transition={press}
      onClick={() => {
        onPress(def);
      }}
    >
      <span className={styles.label}>{def.label}</span>
    </motion.button>
  );
}
