/** Joins CSS class names, skipping falsy entries: cx(styles.key, active && styles.active). */
export const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");
