"use client";

import { useEffect, useState } from "react";

const LINES = [
  "Lettura dell'outfit",
  "Confronto con l'occasione",
  "Controllo coerenza",
  "Primo parere",
];

/**
 * Le quattro righe mono dello scan (prototipo #stage-scan).
 * Si accendono in sequenza: on a i*550ms, done a i*550+450ms.
 */
export function ScanLines({ onDone }: { onDone: () => void }) {
  const [on, setOn] = useState<number>(0);
  const [done, setDone] = useState<number>(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    LINES.forEach((_, i) => {
      timers.push(setTimeout(() => setOn(i + 1), i * 550));
      timers.push(setTimeout(() => setDone(i + 1), i * 550 + 450));
    });
    timers.push(setTimeout(onDone, LINES.length * 550 + 650));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-2xl border border-line bg-panel px-8 py-10">
      {LINES.map((line, i) => (
        <div
          key={line}
          className={`flex items-center gap-3.5 py-2.5 font-mono text-[13.5px] transition-all duration-400 ${
            i < on ? "translate-x-0 opacity-100 text-gold" : "-translate-x-2 opacity-0 text-muted"
          }`}
        >
          <span
            className={`h-2 w-2 shrink-0 rounded-full transition-all duration-300 ${
              i < done ? "bg-gold shadow-[0_0_8px_rgba(242,233,216,0.6)]" : "bg-gold/25"
            }`}
          />
          {line}
        </div>
      ))}
    </div>
  );
}
