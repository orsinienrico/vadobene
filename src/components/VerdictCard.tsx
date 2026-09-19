"use client";

import { Brand } from "./Brand";
import type { JurySummary } from "@/lib/contracts";

/**
 * Stadio 6 — card finale (prototipo #stage-final .verdict-card).
 * Identica al linguaggio della card-specimen, senza inclinazione.
 */
export function VerdictCard({
  summary,
  occasion,
  onNewLook,
}: {
  summary: JurySummary;
  occasion: string;
  onNewLook: () => void;
}) {
  const share = async () => {
    const text = `vado bene? — ${occasion}. ${summary.headline} — vadobene.app`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "vado bene?", text });
        return;
      }
      await navigator.clipboard.writeText(text);
    } catch {
      // Annullato dall'utente o clipboard negata: silenzioso.
    }
  };

  const line =
    summary.result === "tweak"
      ? `${summary.yes + summary.tweak} su 5 dicono che funziona, ${summary.tweak} chiedono una modifica.`
      : summary.result === "yes"
        ? "Funziona così com'è."
        : "Non per questa occasione.";

  const human = summary.human_votes;
  const ai = summary.ai_votes;
  const mixLabel =
    ai > 0 ? `${human} persone vere + ${ai} pareri automatici` : `Cinque persone vere · alla cieca`;

  const dotColor = (i: number) => {
    // I punti seguono l'ordine d'arrivo: ricostruiamo dai conteggi (yes prima).
    const order: ("yes" | "tweak" | "no")[] = [
      ...Array(summary.yes).fill("yes"),
      ...Array(summary.tweak).fill("tweak"),
      ...Array(summary.no).fill("no"),
    ];
    const v = order[i];
    return v === "yes" ? "bg-ok" : v === "tweak" ? "bg-warn" : "bg-bad";
  };

  return (
    <div className="rounded-[20px] border border-line bg-gradient-to-br from-panel-2 to-panel px-7 py-[30px] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
      <div className="flex items-baseline justify-between border-b border-line pb-4">
        <Brand size={16} />
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">{occasion}</span>
      </div>

      <div
        className={`mb-2.5 mt-6 font-display text-[44px] font-semibold leading-none ${
          summary.result === "yes" ? "text-ok" : summary.result === "tweak" ? "text-warn" : "text-bad"
        }`}
      >
        {summary.headline}
      </div>
      <div className="mb-3.5 flex gap-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className={`h-2.5 w-2.5 rounded-full ${dotColor(i)}`} />
        ))}
      </div>
      <p className="text-[14.5px] text-gold">
        {line}
        {summary.top_tweak && <> Modifica più votata: <b className="font-semibold">{summary.top_tweak}</b></>}
      </p>

      {summary.quote && (
        <div className="mt-[18px] border-l-2 border-gold bg-gold/5 px-[18px] py-4 font-display text-base italic leading-[1.5]">
          &ldquo;{summary.quote}&rdquo;
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={share}
          className="min-w-[130px] flex-1 rounded-xl bg-gold px-4 py-[15px] text-sm font-semibold text-ink hover:bg-gold-bright"
        >
          Condividi
        </button>
        <button
          type="button"
          onClick={onNewLook}
          className="min-w-[130px] flex-1 rounded-xl border border-line px-4 py-[15px] text-sm font-semibold text-gold hover:border-gold"
        >
          Nuovo look
        </button>
      </div>

      <p className="mt-4 text-center font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">
        {mixLabel}
      </p>
    </div>
  );
}
