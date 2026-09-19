"use client";

import { useCallback, useEffect, useState } from "react";
import { PhotoDrop } from "./PhotoDrop";
import { OccasionChips } from "./OccasionChips";
import { ScanLines } from "./ScanLines";
import { ThreadSent } from "./ThreadSent";
import { AiReply } from "./AiReply";
import type { AiVerdict } from "@/lib/contracts";

type Occasion = { slug: string; label_it: string };

type Stage = "input" | "scan" | "ai";

const TITLES: Record<Stage, { h: string; sub: string }> = {
  input: { h: "Il tuo riflesso", sub: "Foto, occasione, trenta secondi." },
  scan: { h: "Inviato", sub: "Cinque secondi, non di più." },
  ai: { h: "Inviato", sub: "Cinque secondi, non di più." },
};

/**
 * Contenitore a stadi 1→3 del prototipo (input → scan → primo parere).
 * Il titolo del flusso cambia con lo stadio.
 */
export function Flow() {
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [stage, setStage] = useState<Stage>("input");
  const [photo, setPhoto] = useState<string | null>(null);
  const [occasion, setOccasion] = useState<Occasion | null>(null);
  const [verdict, setVerdict] = useState<AiVerdict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/occasions")
      .then((r) => r.json())
      .then((d: { occasions: Occasion[] }) => setOccasions(d.occasions))
      .catch(() => setOccasions([]));
  }, []);

  const ready = photo && occasion && !submitting;

  const start = useCallback(async () => {
    if (!photo || !occasion) return;
    setSubmitting(true);
    setError(null);
    setStage("scan");
    try {
      const res = await fetch("/api/verdict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo, occasionSlug: occasion.slug }),
      });
      if (res.status === 422) {
        const d = await res.json();
        setError(d.error ?? "Non vedo un outfit. Riprova con una foto a figura intera.");
        setStage("input");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json();
      setVerdict(d.verdict as AiVerdict);
      setStage("ai");
    } catch {
      setError("Il primo parere non è arrivato. Riprova.");
      setStage("input");
    } finally {
      setSubmitting(false);
    }
  }, [photo, occasion]);

  return (
    <section className="mx-auto max-w-[680px] px-6 pb-[110px] pt-[72px]">
      <div className="mb-11 text-center">
        <h2 className="font-display text-[clamp(28px,3.6vw,40px)] font-normal">{TITLES[stage].h}</h2>
        <p className="mt-2.5 text-[15px] text-muted">{TITLES[stage].sub}</p>
      </div>

      {/* STADIO 1: input */}
      {stage === "input" && (
        <div className={stage === "input" ? "animate-fade" : ""}>
          <PhotoDrop photo={photo} onPhoto={setPhoto} />

          <p className="mb-3.5 mt-[34px] font-mono text-[11.5px] uppercase tracking-[0.18em] text-muted">
            Per cosa?
          </p>
          <OccasionChips occasions={occasions} selected={occasion?.slug ?? null} onSelect={(slug) => setOccasion(occasions.find((o) => o.slug === slug) ?? null)} />

          <button
            type="button"
            disabled={!ready}
            onClick={start}
            className="mt-[34px] w-full rounded-[14px] bg-gold py-[18px] text-base font-semibold tracking-[0.04em] text-ink transition-colors enabled:hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-35"
          >
            Vado bene?
          </button>
          <p className="mt-3.5 text-center text-[12.5px] text-muted">
            {error ??
              (ready
                ? "Tutto pronto."
                : !photo
                  ? "Aggiungi una foto per continuare"
                  : "Scegli l'occasione per continuare")}
          </p>
        </div>
      )}

      {/* STADIO 2: scan */}
      {stage === "scan" && <ScanLines onDone={() => { /* sostituito dall'arrivo della risposta */ }} />}

      {/* STADIO 3: inviato + primo parere */}
      {stage === "ai" && photo && occasion && verdict && (
        <div className="animate-fade flex flex-col gap-3">
          <ThreadSent photo={photo} occasion={occasion.label_it} />
          <AiReply verdict={verdict} occasion={occasion.label_it} />
          <div className="self-center text-center font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            Questo è un algoritmo · quello che conta arriva dalle persone
          </div>
          <div className="mt-1.5 flex flex-wrap gap-3">
            <button
              type="button"
              className="min-w-[130px] flex-1 rounded-xl bg-gold px-4 py-[15px] text-sm font-semibold text-ink hover:bg-gold-bright"
              onClick={() => {
                // Fase 2: reciprocità. Per ora il CTA porta al gate voto.
                window.dispatchEvent(new CustomEvent("vb:request-jury"));
              }}
            >
              Chiedi a cinque persone vere
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
