import type { BinaryOperator } from "../model/types";
import { Key } from "./Key";
import type { KeyDef } from "./keys";
import styles from "./Keypad.module.css";

interface KeypadProps<E> {
  keys: readonly KeyDef<E>[];
  send: (event: E) => void;
  /** Basic mode: the operator waiting for its second operand, shown inverted. */
  activeOperator?: BinaryOperator | null;
}

export function Keypad<E>({ keys, send, activeOperator = null }: KeypadProps<E>) {
  return (
    <div className={styles.grid} role="group" aria-label="keypad">
      {keys.map((def) => (
        <Key
          key={def.id}
          def={def}
          active={def.operator !== undefined && def.operator === activeOperator}
          onPress={(d) => {
            send(d.event);
          }}
        />
      ))}
    </div>
  );
}
