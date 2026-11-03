"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JurySummary } from "@/lib/contracts";
import { track } from "@/lib/analytics";

type LiveVote = {
  id: string;
  verdict: "yes" | "tweak" | "no";
  note: string | null;
  is_ai: boolean;
};

const LBL: Record<LiveVote["verdict"], string> = {
  yes: "Funziona",
  tweak: "Con una modifica",
  no: "No",
};

// La summary non è pronta: si riprova ogni ~3s fino a ~90s dopo la deadline.
const SUMMARY_RETRY_MS = 3000;
const SUMMARY_GIVE_UP_AFTER_MS = 90_000;
// Realtime non attivo (Safari mobile, rete debole): polling di fallback.
const FALLBACK_POLL_MS = 15_000;

/**
 * Stadio 5 — "Stanno guardando" (prototipo #stage-jury).
 * Timer 3:00, barra 5 segmenti, risposte che entrano come messaggi numerati.
 * L'unico momento animato del prodotto (pop alla comparsa).
 * Con fill AI dichiarato (aiFill) il copy non promette giurati reali che non ci sono.
 */
export function JuryLive({
  requestId,
  target = 5,
  deadline,
  aiFill = false,
  onClosed,
}: {
  requestId: string;
  target?: number;
  deadline: string;
  aiFill?: boolean;
  onClosed: (summary: JurySummary) => void;
}) {
  const [votes, setVotes] = useState<LiveVote[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const closedRef = useRef(false);
  // Catena di retry della summary in ref: sopravvive ai re-run dell'effetto
  // (cambio voti dopo la chiusura) e si cancella solo allo smontaggio reale.
  const retryRef = useRef<{ cancelled: boolean; timer: ReturnType<typeof setTimeout> | null } | null>(
    null
  );

  // onClosed arriva da Flow come arrow inline (identità instabile): lo teniamo in ref.
  const onClosedRef = useRef(onClosed);
  useEffect(() => {
    onClosedRef.current = onClosed;
  });

  // Mount/dis mount: il cleanup dell'effetto chiusura distingue il re-run per
  // deps (non deve cancellare la catena) dallo smontaggio vero (la cancella).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const secondsLeft = useMemo(() => {
    return Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now()) / 1000));
  }, [deadline]);
  const [timeLeft, setTimeLeft] = useState(secondsLeft);

  // La deadline è passata: trigger di chiusura anche senza nuovi voti.
  // Separato da timeLeft (che cambia ogni secondo): l'effetto di chiusura non
  // dipende più dal tick e la sua catena di retry non viene più cancellata
  // a ogni secondo (race P0: un tick dopo il quinto voto uccideva il retry).
  const [expired, setExpired] = useState(secondsLeft <= 0);
  useEffect(() => {
    if (expired) return;
    const t = setTimeout(
      () => setExpired(true),
      Math.max(0, new Date(deadline).getTime() - Date.now()) + 50
    );
    return () => clearTimeout(t);
  }, [expired, deadline]);

  // Voti: stato iniziale (ordine d'arrivo), realtime, fallback per tab in background.
  useEffect(() => {
    let cancelled = false;
    let channel: import("@supabase/supabase-js").RealtimeChannel | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const fetchVotes = async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data } = await supabase
          .from("votes")
          .select("id, verdict, note, is_ai")
          .eq("request_id", requestId)
          .order("created_at", { ascending: true });
        if (!cancelled && data) setVotes(data as LiveVote[]);
      } catch {
        // Silenzioso: il canale realtime o il prossimo giro riprova.
      }
    };

    const startPolling = () => {
      if (!pollTimer && !cancelled) pollTimer = setInterval(fetchVotes, FALLBACK_POLL_MS);
    };
    const stopPolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    (async () => {
      await fetchVotes();
      if (cancelled) return;
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      channel = supabase
        .channel(`jury-${requestId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "votes", filter: `request_id=eq.${requestId}` },
          (payload) => {
            setVotes((prev) => {
              if (prev.some((v) => v.id === payload.new.id)) return prev;
              return [...prev, payload.new as LiveVote];
            });
          }
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") stopPolling();
          else startPolling();
        });
    })();

    // La tab torna visibile: il realtime può essere caduto in background.
    const onVisibility = () => {
      if (document.visibilityState === "visible" && !closedRef.current) fetchVotes();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      stopPolling();
      if (channel) {
        import("@/lib/supabase/client").then(({ createClient }) => {
          createClient().removeChannel(channel!);
        });
      }
    };
  }, [requestId]);

  // Timer.
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Chiusura: 5 voti arrivati o deadline passata → fetch della summary con retry.
  // Deps senza timeLeft: il tick non ri-esegue l'effetto e non cancella più la
  // catena; i trigger sono solo semantici (cambio voti, deadline passata).
  useEffect(() => {
    if (closedRef.current) return;
    const reachedFive = votes.length >= target;
    const deadlinePassed = expired || new Date(deadline).getTime() <= Date.now();
    if (!reachedFive && !deadlinePassed) return;
    closedRef.current = true;
    const wait = reachedFive ? 800 : 2000;
    // Con deadline sintetica (resume di un 409) il give-up parte da adesso:
    // la catena resta viva abbastanza da trovare la summary.
    const giveUpAt = Math.max(new Date(deadline).getTime(), Date.now()) + SUMMARY_GIVE_UP_AFTER_MS;
    const chain = retryRef.current ?? { cancelled: false, timer: null };
    retryRef.current = chain;

    const attempt = (delay: number) => {
      chain.timer = setTimeout(async () => {
        if (chain.cancelled) return;
        try {
          const { createClient } = await import("@/lib/supabase/client");
          const supabase = createClient();
          const { data } = await supabase
            .from("requests")
            .select("status, jury_summary")
            .eq("id", requestId)
            .single();
          if (data?.jury_summary) {
            onClosedRef.current(data.jury_summary as JurySummary);
            return;
          }
        } catch {
          // Rete o Supabase giù: si riprova sotto.
        }
        if (Date.now() < giveUpAt) {
          attempt(SUMMARY_RETRY_MS);
        } else {
          setFetchError("La risposta tarda più del previsto. Controlla la connessione e ricarica.");
        }
      }, delay);
    };
    attempt(wait);

    return () => {
      // Re-run per deps dopo la chiusura (altro voto in arrivo): la catena
      // continua. Solo lo smontaggio reale la cancella.
      if (!mountedRef.current && chain) {
        chain.cancelled = true;
        if (chain.timer) clearTimeout(chain.timer);
      }
    };
  }, [votes.length, expired, target, requestId, deadline]);

  const mm = Math.floor(timeLeft / 60);
  const ss = String(timeLeft % 60).padStart(2, "0");
  const title = aiFill ? "Stiamo completando le tue risposte" : "Cinque persone stanno guardando";

  return (
    <div>
      <div className="mb-3.5 flex items-baseline justify-between">
        <h3 className="font-display text-[22px] font-normal">{title}</h3>
        <span
          aria-label={`${mm} minuti e ${ss} secondi rimasti`}
          className="font-display text-2xl tabular-nums text-gold"
          role="timer"
        >
          {mm}:{ss}
        </span>
      </div>
      <div className="mb-[18px] flex gap-2">
        {Array.from({ length: target }).map((_, i) => {
          const v = votes[i];
          return (
            <span
              key={i}
              className={`h-2 flex-1 rounded-full transition-colors duration-300 ${
                v ? (v.verdict === "yes" ? "bg-ok" : v.verdict === "tweak" ? "bg-warn" : "bg-bad") : "bg-gold/20"
              }`}
            />
          );
        })}
      </div>
      {fetchError && (
        <p role="alert" className="mb-3 text-center text-[13px] text-bad">{fetchError}</p>
      )}
      <div className="flex flex-col gap-3">
        {votes.map((v, i) => (
          <Reply
            key={v.id}
            n={i + 1}
            verdict={v.verdict}
            note={v.note}
            isAi={v.is_ai}
          />
        ))}
        {votes.length < target && (
          <p className="mt-[18px] text-center text-[12.5px] text-muted">
            {aiFill
              ? "Alcuni pareri saranno automatici e dichiarati."
              : "Vedono l’outfit e l’occasione, non te."}
          </p>
        )}
      </div>
      {/* Boost (spec §7): discreto, sotto la live, solo se i pareri non sono
          già automatici — l'utile qui è più pareri reali, non un altro fill. */}
      {!aiFill && <BoostOffer />}
    </div>
  );
}

/** CTA Boost (spec §7): checkout Stripe e redirect. Onesta, non invadente. */
function BoostOffer() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      void track("boost_started");
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: "boost" }),
      });
      const d = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.ok && d.url) {
        window.location.href = d.url;
        return;
      }
      setError(
        res.status === 401
          ? "Per il Boost serve un account: entra dalla home."
          : (d.error ?? "Pagamento non riuscito. Riprova.")
      );
    } catch {
      setError("Pagamento non riuscito. Riprova.");
    } finally {
      setBusy(false);
    }
  }, [busy]);

  return (
    <div className="mt-[18px] rounded-xl border border-line bg-panel px-4 py-3.5 text-center">
      <p className="text-[12.5px] text-muted">
        Vuoi più pareri anche dopo? Con il Boost ne ricevi senza dover votare.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={start}
        className="mt-2.5 rounded-lg border border-line px-4 py-2 text-[13px] font-semibold text-gold transition-colors hover:border-gold disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Apro il pagamento…" : "Aggiungi Boost · €0,99"}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-[12px] text-bad">{error}</p>
      )}
    </div>
  );
}

function Reply({
  n,
  verdict,
  note,
  isAi,
}: {
  n: number;
  verdict: LiveVote["verdict"];
  note: string | null;
  isAi: boolean;
}) {
  const dot = verdict === "yes" ? "bg-ok" : verdict === "tweak" ? "bg-warn" : "bg-bad";
  const label = verdict === "yes" ? "text-ok" : verdict === "tweak" ? "text-warn" : "text-bad";
  return (
    <div className="vb-pop flex max-w-[84%] items-start gap-3 self-start rounded-[16px_16px_16px_4px] border border-line bg-black/20 px-4 py-3 text-[15px] leading-[1.35]">
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-medium text-ink ${dot}`}>
        {n}
      </span>
      <span>
        <b className={`mb-px block font-mono text-[10.5px] uppercase tracking-[0.14em] ${label}`}>
          {LBL[verdict]}
          {isAi ? " · automatico" : ""}
        </b>
        {note}
      </span>
    </div>
  );
}
