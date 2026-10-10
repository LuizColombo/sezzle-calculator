import type { ExpressionEvent } from "../model/expression";
import { Key } from "./Key";
import { KEYS } from "./keys";
import styles from "./Keypad.module.css";

interface KeypadProps {
  send: (event: ExpressionEvent) => void;
}

export function Keypad({ send }: KeypadProps) {
  return (
    <div className={styles.grid} role="group" aria-label="keypad">
      {KEYS.map((def) => (
        <Key
          key={def.id}
          def={def}
          onPress={(d) => {
            send(d.event);
          }}
        />
      ))}
    </div>
  );
}
