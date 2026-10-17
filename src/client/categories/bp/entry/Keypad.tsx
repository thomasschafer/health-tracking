import { vibrate } from "../../../haptics.ts";
import { Delete } from "lucide-react";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

interface KeypadProps {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
}

/** A phone-style number pad, so entry doesn't depend on the system keyboard appearing. */
export function Keypad({ onDigit, onBackspace }: KeypadProps) {
  const press = (fn: () => void) => () => {
    vibrate(8);
    fn();
  };
  return (
    <div className="keypad" role="group" aria-label="Number pad">
      {DIGITS.map((d) => (
        <button
          key={d}
          type="button"
          className="key"
          onClick={press(() => {
            onDigit(d);
          })}
        >
          {d}
        </button>
      ))}
      <span aria-hidden="true" />
      <button
        type="button"
        className="key"
        onClick={press(() => {
          onDigit("0");
        })}
      >
        0
      </button>
      <button
        type="button"
        className="key key-plain"
        aria-label="Delete"
        onClick={press(onBackspace)}
      >
        <Delete size={26} aria-hidden="true" />
      </button>
    </div>
  );
}
