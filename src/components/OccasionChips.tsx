"use client";

/**
 * Chip occasione (prototipo .chips). Selezione singola, obbligatoria.
 */
export function OccasionChips({
  occasions,
  selected,
  onSelect,
}: {
  occasions: { slug: string; label_it: string }[];
  selected: string | null;
  onSelect: (slug: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {occasions.map((o) => (
        <button
          key={o.slug}
          type="button"
          onClick={() => onSelect(o.slug)}
          aria-pressed={selected === o.slug}
          className={
            "rounded-full border px-[18px] py-2.5 text-sm transition-all " +
            (selected === o.slug
              ? "border-gold bg-gold font-semibold text-ink"
              : "border-line bg-panel text-gold hover:border-gold")
          }
        >
          {o.label_it}
        </button>
      ))}
    </div>
  );
}
