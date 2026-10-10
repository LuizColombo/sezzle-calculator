import type { BinaryOperator, CalculatorEvent } from "../model/types";
import { Key } from "./Key";
import { KEYS } from "./keys";
import styles from "./Keypad.module.css";

interface KeypadProps {
  send: (event: CalculatorEvent) => void;
  /** The operator waiting for its second operand, shown inverted. */
  activeOperator: BinaryOperator | null;
}

export function Keypad({ send, activeOperator }: KeypadProps) {
  return (
    <div className={styles.grid} role="group" aria-label="keypad">
      {KEYS.map((def) => (
        <Key
          key={def.id}
          def={def}
          active={def.variant === "operator" && def.operator === activeOperator}
          onPress={(d) => {
            send(d.event);
          }}
        />
      ))}
    </div>
  );
}
