import { vibrate } from "../../../haptics.ts";
import { useEffect, useState } from "react";

const RADIUS = 88;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface RestTimerProps {
  endsAt: number;
  totalSeconds: number;
  nextLabel: string;
  onDone: () => void;
}

/** Counts down between readings, which makes consecutive readings more consistent. */
export function RestTimer({ endsAt, totalSeconds, nextLabel, onDone }: RestTimerProps) {
  const [now, setNow] = useState(() => Date.now());
  const remainingMs = Math.max(0, endsAt - now);

  useEffect(() => {
    if (remainingMs === 0) {
      vibrate([30, 60, 30]);
      onDone();
      return;
    }
    const timer = setTimeout(() => {
      setNow(Date.now());
    }, 200);
    return () => {
      clearTimeout(timer);
    };
  }, [remainingMs, onDone]);

  const seconds = Math.ceil(remainingMs / 1000);
  const progress = remainingMs / (totalSeconds * 1000);
  return (
    <div className="rest">
      <div className="rest-ring">
        <svg viewBox="0 0 200 200" aria-hidden="true">
          <circle cx="100" cy="100" r={RADIUS} className="rest-track" />
          <circle
            cx="100"
            cy="100"
            r={RADIUS}
            className="rest-progress"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
          />
        </svg>
        <span className="rest-seconds rounded-nums" role="timer" aria-live="off">
          {seconds}
        </span>
      </div>
      <p className="rest-title">Rest for a moment</p>
      <p className="rest-detail">Stay seated and relaxed. {nextLabel} starts automatically.</p>
      <button type="button" className="button plain" onClick={onDone}>
        Start now
      </button>
    </div>
  );
}
