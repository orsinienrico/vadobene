"use client";

import { useCallback, useEffect, useState } from "react";

type Card = {
  id: string;
  occasion: string;
  photoUrl: string | null;
  votesSoFar: number;
  deadline: string | null;
};

const CREDIT_MESSAGE =
  "La riga parla della persona, non dell'outfit: non verrà mostrata. Il voto sì.";

/**
 * Stadio 4 — "Prima rispondi tu" (prototipo #stage-gate).
 * Barra 5 segmenti del credito, card outfit anonimo, tre bottoni, nota facoltativa.
 * Magic link richiesto solo per votare.
 */
export function VoteGate({ onCreditFull }: { onCreditFull: (credit: number) => void }) {
  const [credit, setCredit] = useState<number>(0);
  const [card, setCard] = useState<Card | null>(null);
  const [emptyMessage, setEmptyMessage] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [authNeeded, setAuthNeeded] = useState(false);
  const [email, setEmail] = useState("");
  const [magicSent, setMagicSent] = useState(false);

  const loadNext = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/queue/next");
      const d = await res.json();
      if (d.card) {
        setCard(d.card);
        setNote("");
        setEmptyMessage(null);
      } else {
        setCard(null);
        setEmptyMessage(d.message ?? "Nessuno sta chiedendo in questo momento");
      }
      if (res.status === 401) setAuthNeeded(true);
    } catch {
      setEmptyMessage("La coda non risponde. Riprova.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    loadNext();
  }, [loadNext]);

  const cast = async (verdict: "yes" | "tweak" | "no") => {
    if (!card || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: card.id, verdict, note: note.trim() || undefined }),
      });
      const d = await res.json();
      if (res.status === 401) {
        setAuthNeeded(true);
        return;
      }
      if (!res.ok) {
        setMessage(d.error ?? "Voto non registrato.");
        return;
      }
      if (d.noteStatus === "filtered") {
        setMessage(CREDIT_MESSAGE);
      }
      const newCredit = d.credit as number;
      setCredit(newCredit);
      if (newCredit >= 5) {
        setTimeout(() => onCreditFull(newCredit), 600);
      } else {
        loadNext();
      }
    } catch {
      setMessage("Voto non registrato. Riprova.");
    } finally {
      setBusy(false);
    }
  };

  const sendMagicLink = async () => {
    if (!email.includes("@")) return;
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    setMagicSent(true);
  };

  return (
    <div>
      <div className="rounded-2xl border border-line bg-panel px-6 py-7 text-center">
        <h3 className="font-display text-[22px] font-normal">
          Per ricevere cinque pareri, dai cinque voti
        </h3>
        <p className="mx-auto mt-2 max-w-[44ch] text-sm text-muted">
          Nessuna folla in attesa: solo persone che si aiutano a vicenda. Un tocco, senza
          pensarci troppo.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-[34px] rounded-full ${i < credit ? "bg-gold" : "bg-gold/20"}`}
            />
          ))}
        </div>
        {authNeeded && (
          <div className="mt-4 text-sm">
            {magicSent ? (
              <p className="text-ok">Controlla la mail: ti ho mandato il link per entrare.</p>
            ) : (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <span className="text-muted">Per votare serve una mail:</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@esempio.it"
                  className="w-52 rounded-[10px] border border-line bg-panel-2 px-3 py-2 text-gold placeholder:text-muted"
                />
                <button
                  type="button"
                  onClick={sendMagicLink}
                  className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-ink hover:bg-gold-bright"
                >
                  Entra
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {card ? (
        <div className="mt-3.5 rounded-[18px] border border-line bg-gradient-to-br from-panel-2 to-panel p-[18px]">
          <div className="mb-3.5 aspect-[3/4] w-full overflow-hidden rounded-xl bg-panel">
            {card.photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={card.photoUrl} alt="Outfit anonimo" className="block h-full w-full object-cover" />
            )}
          </div>
          <p className="mb-3 text-center text-[15px]">
            <b className="font-semibold">Vado bene?</b> {card.occasion}.
          </p>
          <div className="grid grid-cols-3 gap-2">
            <button type="button" disabled={busy} onClick={() => cast("yes")} className="rounded-xl bg-ok py-3.5 text-[13.5px] font-semibold text-ink">
              Funziona
            </button>
            <button type="button" disabled={busy} onClick={() => cast("tweak")} className="rounded-xl bg-warn py-3.5 text-[13.5px] font-semibold text-ink">
              Modifica
            </button>
            <button type="button" disabled={busy} onClick={() => cast("no")} className="rounded-xl bg-bad py-3.5 text-[13.5px] font-semibold text-ink">
              No
            </button>
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={80}
            placeholder="Una riga, se vuoi. Sull'outfit, mai sulla persona."
            className="mt-3 w-full rounded-[10px] border border-line bg-panel px-3.5 py-2.5 text-[13.5px] text-gold placeholder:text-muted"
          />
          <p className="mt-3 min-h-4 text-center text-[12.5px] text-bad">{message}</p>
        </div>
      ) : (
        <div className="mt-3.5 rounded-2xl border border-line bg-panel px-6 py-8 text-center">
          <p className="text-[15px] text-muted">{emptyMessage}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={loadNext} className="rounded-xl border border-line px-5 py-3 text-sm font-semibold hover:border-gold">
              Ricontrolla
            </button>
            <button
              type="button"
              onClick={() => onCreditFull(credit)}
              className="rounded-xl bg-gold px-5 py-3 text-sm font-semibold text-ink hover:bg-gold-bright"
            >
              Procedi comunque
            </button>
          </div>
          <p className="mt-3 text-[12.5px] text-muted">
            Se procedi senza votare, la tua richiesta riceverà pareri automatici, dichiarati come tali.
          </p>
        </div>
      )}
    </div>
  );
}
