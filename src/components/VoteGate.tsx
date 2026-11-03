"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";

type Card = {
  id: string;
  occasion: string;
  photoUrl: string | null;
  votesSoFar: number;
  deadline: string | null;
};

/**
 * Stati del gate, tutti distinti:
 * - "auth": 401, nuovo utente → invito reciproco (niente finto "Procedi comunque").
 * - "empty": autenticato, coda vuota → "Procedi comunque" porta alla live (fill AI dichiarato).
 * - "done": crediti di sessione finiti → niente "Procedi comunque" che non porta a una card.
 * - "card": outfit anonimo da votare.
 */
type GateMode = "loading" | "auth" | "empty" | "done" | "card";

const NOTE_FILTERED_MESSAGE =
  "La riga parla della persona, non dell'outfit: non verrà mostrata. Il voto sì.";

// L'avviso di moderazione resta leggibile prima dello swap della card.
const SWAP_DELAY_MS = 1200;

/**
 * Stadio 4 — "Prima rispondi tu" (prototipo #stage-gate).
 * Barra 5 segmenti del credito, card outfit anonimo, tre bottoni, nota facoltativa.
 * Magic link richiesto solo per votare.
 */
export function VoteGate({
  onCreditFull,
}: {
  onCreditFull: (credit: number, opts?: { allowAi?: boolean }) => void;
}) {
  const [credit, setCredit] = useState<number>(0);
  const [card, setCard] = useState<Card | null>(null);
  const [mode, setMode] = useState<GateMode>("loading");
  const [emptyMessage, setEmptyMessage] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [authNeeded, setAuthNeeded] = useState(false);
  const [email, setEmail] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const [magicError, setMagicError] = useState<string | null>(null);
  const [magicBusy, setMagicBusy] = useState(false);

  // onCreditFull arriva da Flow come arrow inline (identità instabile): lo teniamo
  // in ref per non rifare il fetch iniziale a ogni render del parent.
  const openRef = useRef(onCreditFull);
  useEffect(() => {
    openRef.current = onCreditFull;
  });

  const loadNext = useCallback(async (isInitial = false) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/queue/next");
      const d = (await res.json().catch(() => ({}))) as {
        card?: Card | null;
        credit?: number;
        done?: boolean;
        message?: string;
      };
      // Contratto: credit è il credito server dell'utente.
      if (typeof d.credit === "number") {
        setCredit(d.credit);
        // Reciprocità già soddisfatta: salta il gate, apri direttamente il giurì.
        if (isInitial && d.credit >= 5) {
          openRef.current(d.credit);
          return;
        }
      }
      if (res.status === 401) {
        setAuthNeeded(true);
        setCard(null);
        setMode("auth");
        return;
      }
      if (d.done) {
        setCard(null);
        setEmptyMessage(d.message ?? "Hai già dato tutti i tuoi voti per adesso.");
        setMode("done");
        return;
      }
      if (d.card) {
        setCard(d.card);
        setNote("");
        setEmptyMessage(null);
        setMode("card");
      } else {
        setCard(null);
        setEmptyMessage(d.message ?? "Nessuno sta chiedendo in questo momento");
        setMode("empty");
      }
    } catch {
      setCard(null);
      setEmptyMessage("La coda non risponde. Riprova.");
      setMode("empty");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    loadNext(true);
  }, [loadNext]);

  const cast = async (verdict: "yes" | "tweak" | "no") => {
    if (!card || busy || swapping) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: card.id, verdict, note: note.trim() || undefined }),
      });
      const d = (await res.json().catch(() => ({}))) as {
        credit?: number;
        noteStatus?: string;
        error?: string;
      };
      if (res.status === 401) {
        setAuthNeeded(true);
        return;
      }
      if (!res.ok) {
        setMessage(d.error ?? "Voto non registrato.");
        return;
      }
      const newCredit = typeof d.credit === "number" ? d.credit : credit + 1;
      setCredit(newCredit);
      void track("vote_cast", {
        verdict,
        has_note: !!note.trim(),
        note_filtered: d.noteStatus === "filtered",
      });
      if (d.noteStatus === "filtered") {
        // L'avviso resta sullo schermo: la card successiva arriva dopo la pausa.
        setMessage(NOTE_FILTERED_MESSAGE);
        setSwapping(true);
        setTimeout(() => {
          setSwapping(false);
          loadNext();
        }, SWAP_DELAY_MS);
        return;
      }
      if (newCredit >= 5) {
        setTimeout(() => openRef.current(newCredit), 600);
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
    if (magicBusy) return;
    if (!email.includes("@")) {
      setMagicError("Quella non sembra una mail. Ricontrolla.");
      return;
    }
    setMagicError(null);
    setMagicBusy(true);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        // ?resume=1 sopravvive al round-trip dei token (che usano l'hash):
        // al ritorno il flusso riprende dalla richiesta più recente.
        options: { emailRedirectTo: `${window.location.origin}/?resume=1` },
      });
      if (error) {
        setMagicError("Il link non è partito. Controlla l'indirizzo e riprova.");
        return;
      }
      setMagicSent(true);
    } catch {
      setMagicError("Il link non è partito. Controlla l'indirizzo e riprova.");
    } finally {
      setMagicBusy(false);
    }
  };

  const authBox = (
    <div className="mt-4 text-sm">
      {magicSent ? (
        <p className="text-ok">Controlla la mail: ti ho mandato il link per entrare.</p>
      ) : (
        <>
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
              disabled={magicBusy}
              onClick={sendMagicLink}
              className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-ink hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
            >
              Entra
            </button>
          </div>
          {magicError && (
            <p role="alert" className="mt-3 text-[12.5px] text-bad">{magicError}</p>
          )}
          <p className="mt-3 text-[12.5px] text-muted">
            Non ti serve votare per procedere: dopo l&apos;accesso puoi comunque ricevere pareri
            automatici.
          </p>
        </>
      )}
    </div>
  );

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
        {authNeeded && authBox}
      </div>

      {mode === "card" && card ? (
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
            <button type="button" disabled={busy || swapping} onClick={() => cast("yes")} className="rounded-xl bg-ok py-3.5 text-[13.5px] font-semibold text-ink">
              Funziona
            </button>
            <button type="button" disabled={busy || swapping} onClick={() => cast("tweak")} className="rounded-xl bg-warn py-3.5 text-[13.5px] font-semibold text-ink">
              Modifica
            </button>
            <button type="button" disabled={busy || swapping} onClick={() => cast("no")} className="rounded-xl bg-bad py-3.5 text-[13.5px] font-semibold text-ink">
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
          <p aria-live="polite" className="mt-3 min-h-4 text-center text-[12.5px] text-bad">{message}</p>
        </div>
      ) : mode === "done" ? (
        <div className="mt-3.5 rounded-2xl border border-line bg-panel px-6 py-8 text-center">
          <p className="text-[15px] text-muted">{emptyMessage}</p>
          <div className="mt-4 flex justify-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => loadNext()}
              className="rounded-xl border border-line px-5 py-3 text-sm font-semibold hover:border-gold"
            >
              Ricontrolla
            </button>
          </div>
        </div>
      ) : mode === "empty" ? (
        <div className="mt-3.5 rounded-2xl border border-line bg-panel px-6 py-8 text-center">
          <p className="text-[15px] text-muted">{emptyMessage}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => loadNext()}
              className="rounded-xl border border-line px-5 py-3 text-sm font-semibold hover:border-gold"
            >
              Ricontrolla
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => openRef.current(credit, { allowAi: true })}
              className="rounded-xl bg-gold px-5 py-3 text-sm font-semibold text-ink hover:bg-gold-bright"
            >
              Procedi comunque
            </button>
          </div>
          <p className="mt-3 text-[12.5px] text-muted">
            Se procedi senza votare, la tua richiesta riceverà pareri automatici, dichiarati come tali.
          </p>
        </div>
      ) : null}
    </div>
  );
}
