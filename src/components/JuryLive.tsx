"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { JurySummary } from "@/lib/contracts";

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

/**
 * Stadio 5 — "Stanno guardando" (prototipo #stage-jury).
 * Timer 3:00, barra 5 segmenti, risposte che entrano come messaggi numerati.
 * L'unico momento animato del prodotto (pop alla comparsa).
 */
export function JuryLive({
  requestId,
  target = 5,
  deadline,
  onClosed,
}: {
  requestId: string;
  target?: number;
  deadline: string;
  onClosed: (summary: JurySummary) => void;
}) {
  const [votes, setVotes] = useState<LiveVote[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const closedRef = useRef(false);

  const secondsLeft = useMemo(() => {
    return Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now()) / 1000));
  }, [deadline]);
  const [timeLeft, setTimeLeft] = useState(secondsLeft);

  // Realtime: le risposte arrivano senza polling.
  useEffect(() => {
    let channel: import("@supabase/supabase-js").RealtimeChannel | null = null;
    let cancelled = false;

    (async () => {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();

      // Stato iniziale (voti già arrivati prima del mount).
      const { data: existing } = await supabase
        .from("votes")
        .select("id, verdict, note, is_ai")
        .eq("request_id", requestId);
      if (!cancelled && existing) setVotes(existing as LiveVote[]);

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
        .subscribe();
    })();

    return () => {
      cancelled = true;
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

  // Chiusura: 5 voti arrivati o timer a zero → il cron ha chiuso, fetch della summary.
  useEffect(() => {
    if (closedRef.current) return;
    if (votes.length >= target || timeLeft <= 0) {
      closedRef.current = true;
      const wait = votes.length >= target ? 800 : 2000;
      setTimeout(async () => {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data } = await supabase
          .from("requests")
          .select("status, jury_summary")
          .eq("id", requestId)
          .single();
        if (data?.jury_summary) {
          onClosed(data.jury_summary as JurySummary);
        } else {
          // Cron non ancora passato: riprova una volta.
          setTimeout(async () => {
            const { data: retry } = await supabase
              .from("requests")
              .select("jury_summary")
              .eq("id", requestId)
              .single();
            if (retry?.jury_summary) onClosed(retry.jury_summary as JurySummary);
          }, 4000);
        }
      }, wait);
    }
  }, [votes.length, timeLeft, target, requestId, onClosed]);

  const mm = Math.floor(timeLeft / 60);
  const ss = String(timeLeft % 60).padStart(2, "0");

  return (
    <div>
      <div className="mb-3.5 flex items-baseline justify-between">
        <h3 className="font-display text-[22px] font-normal">Cinque persone stanno guardando</h3>
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
            Vedono l&apos;outfit e l&apos;occasione, non te.
          </p>
        )}
      </div>
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
