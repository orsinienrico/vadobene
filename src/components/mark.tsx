/**
 * Il marchio "?" a cinque punti — docs/brand/mark.svg.
 * Un solo colore per volta: currentColor.
 * Gancio: path M15 42 C15 12 85 12 85 42 C85 66 50 62 50 90, stroke 21, linecap round.
 * Cinque punti: centro (50,118) r 8.5; quattro attorno (32,105) (68,105) (32,131) (68,131) r 8.
 */
export function MarkSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 140" className={className} aria-hidden="true" focusable="false">
      <path
        d="M15 42 C15 12 85 12 85 42 C85 66 50 62 50 90"
        fill="none"
        stroke="currentColor"
        strokeWidth={21}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g fill="currentColor">
        <circle cx={50} cy={118} r={8.5} />
        <circle cx={32} cy={105} r={8} />
        <circle cx={68} cy={105} r={8} />
        <circle cx={32} cy={131} r={8} />
        <circle cx={68} cy={131} r={8} />
      </g>
    </svg>
  );
}
