import { MarkSvg } from "./mark";

/**
 * Logotipo "vado bene" + marchio "?" a cinque punti (BRAND.md §3).
 * Il marchio è sempre l'SVG ufficiale, mai il carattere tipografico.
 * Larghezza marchio 0.72em, altezza 1.01em, baseline offset −0.03em.
 */
export function Brand({ size = 21, color }: { size?: number; color?: string }) {
  return (
    <span
      className="inline-flex items-baseline font-logo font-extrabold leading-none tracking-[-0.045em]"
      style={{ fontSize: size, color: color ?? "inherit" }}
    >
      vado bene
      <span
        aria-hidden="true"
        className="ml-[0.05em] inline-block shrink-0 self-end -mb-[0.03em]"
        style={{ width: "0.72em", height: "1.01em" }}
      >
        <MarkSvg />
      </span>
    </span>
  );
}
