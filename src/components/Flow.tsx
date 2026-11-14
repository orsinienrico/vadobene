"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PhotoDrop } from "./PhotoDrop";
import { OccasionChips } from "./OccasionChips";
import { ScanLines } from "./ScanLines";
import { ThreadSent } from "./ThreadSent";
import { AiReply } from "./AiReply";
import { VoteGate } from "./VoteGate";
import { JuryLive } from "./JuryLive";
import { VerdictCard } from "./VerdictCard";
import { flowHeader, useFlowMachine } from "@/lib/flow-machine";
import type { Occasion } from "@/lib/flow-machine";
import type { AiVerdict, JurySummary } from "@/lib/contracts";
import { track } from "@/lib/analytics";

/**
 * Contenitore a stadi 1→3 del prototipo (input → scan → primo parere).
 * Il titolo del flusso cambia con lo stadio.
 * Stato e transizioni vivono in `flow-machine.ts` (reducer puro); qui restano
 * solo fetch ed effetti, che dispatchano azioni.
 */
export function Flow({ enabled = true, inviteOnly = false }: { enabled?: boolean; inviteOnly?: boolean }) {
  if (!enabled) {
    return (
      <section className="mx-auto max-w-[680px] px-6 pb-[110px] pt-[72px] text-center">
        <h2 className="font-display text-[clamp(28px,3.6vw,40px)] font-normal">
          Anteprima del prodotto
        </h2>
        <p className="mt-4 text-[15px] leading-[1.7] text-muted">
          Il servizio non è ancora attivo. Puoi esplorare il sito, ma la
          raccolta delle foto e i pagamenti restano disabilitati finché
          privacy, database e tempi di risposta non saranno verificati.
        </p>
      </section>
    );
  }
  return inviteOnly ? <InviteOnlyFlow /> : <LiveFlow />;
}

/** Public landing is visible; live photo flow only mounts after server invite check. */
function InviteOnlyFlow() {
  const [mode, setMode] = useState<"loading" | "invited" | "login" | "not-invited" | "unavailable">("loading");
  useEffect(() => {
    let cancelled = false;
    fetch("/api/beta/status", { cache: "no-store" })
      .then((response) => {
        if (cancelled) return;
        setMode(response.ok ? "invited" : response.status === 401 ? "login" :
          response.status === 403 ? "not-invited" : "unavailable");
      })
      .catch(() => { if (!cancelled) setMode("unavailable"); });
    return () => { cancelled = true; };
  }, []);

  if (mode === "invited") return <LiveFlow />;
  return (
    <section className="mx-auto max-w-[680px] px-6 pb-[110px] pt-[72px] text-center">
      <h2 className="font-display text-[clamp(28px,3.6vw,40px)] font-normal">
        {mode === "loading" ? "Controllo l'invito…" :
          mode === "not-invited" ? "L'invito non è ancora attivo." :
          mode === "unavailable" ? "La beta non è disponibile." :
          "Sei nel Giurì?"}
      </h2>
      <p className="mt-4 text-[15px] leading-[1.7] text-muted">
        {mode === "login" ? "Accedi con l'indirizzo email invitato per provare VadoBene." :
          mode === "not-invited" ? "L'accesso è riservato agli indirizzi invitati. Contatta chi ti ha invitato." :
          mode === "unavailable" ? "Non raccogliamo foto finché tutti i servizi non sono stati verificati." :
          "La beta è riservata a un piccolo gruppo di partecipanti."}
      </p>
      {mode === "login" && (
        <a href="/login" className="mt-7 inline-flex rounded-full bg-gold px-7 py-3 font-semibold text-ink">
          Entra nella beta
        </a>
      )}
    </section>
  );
}

function LiveFlow() {
  const [state, dispatch] = useFlowMachine();
  const { occasions, stage, photo, occasion, verdict, error, submitting, scanSlow, jury, summary } =
    state;

  useEffect(() => {
    fetch("/api/occasions")
      .then((r) => r.json())
      .then((d: { occasions: Occasion[] }) => dispatch({ type: "occasionsLoaded", occasions: d.occasions }))
      .catch(() => dispatch({ type: "occasionsLoaded", occasions: [] }));
  }, [dispatch]);

  // Resume (magic link ?resume=1): il redirect tornava all'hero e perdeva tutto.
  // Il param sopravvive al round-trip dei token Supabase (che usano l'hash).
  // Solo lettura: nessun effetto collaterale server-side, nessun localStorage.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("resume") !== "1") return;
    // Pulisci il param conservando l'hash (i token del magic link).
    params.delete("resume");
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`
    );
    let cancelled = false;
    (async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        // Lo scambio dei token nell'hash avviene all'init del client: attendi
        // la sessione con qualche ritentativo breve.
        let userId: string | null = null;
        for (let i = 0; i < 6 && !cancelled; i++) {
          const { data } = await supabase.auth.getUser();
          userId = data.user?.id ?? null;
          if (userId) break;
          await new Promise((r) => setTimeout(r, 400));
        }
        if (!userId || cancelled) return;
        // RLS "requests select own": la richiesta più recente dello user.
        const { data } = await supabase
          .from("requests")
          .select("id, status, jury_deadline_at, jury_summary, custom_occasion, occasions(label_it)")
          .eq("user_id", userId)
          .in("status", ["ai_done", "jury_open", "jury_closed"])
          .order("created_at", { ascending: false })
          .limit(1);
        const latest = (Array.isArray(data) ? data[0] : null) as
          | {
              id: string;
              status: string;
              jury_deadline_at: string | null;
              jury_summary: JurySummary | null;
              custom_occasion: string | null;
              occasions: { label_it: string } | null;
            }
          | null;
        if (!latest || cancelled) return;
        // Occasione per la card finale: custom o label dalla join. L'occasione
        // è obbligatoria (spec §3): se non risolvibile, etichetta vuota al
        // posto di un final vuoto.
        const occasion: Occasion = {
          slug: "custom",
          label_it: latest.custom_occasion ?? latest.occasions?.label_it ?? "",
        };
        if (latest.status === "jury_open" && latest.jury_deadline_at) {
          openedAtRef.current = null;
          dispatch({
            type: "resumed",
            jury: { id: latest.id, deadline: latest.jury_deadline_at },
            summary: null,
            occasion,
          });
          return;
        }
        if (latest.status === "jury_closed" && latest.jury_summary) {
          dispatch({
            type: "resumed",
            jury: latest.jury_deadline_at
              ? { id: latest.id, deadline: latest.jury_deadline_at }
              : null,
            summary: latest.jury_summary,
            occasion,
          });
          return;
        }
        if (latest.status === "ai_done") {
          dispatch({ type: "resumed", jury: null, summary: null, occasion: null });
        }
        // Nessuna richiesta riprendibile: resta nell'input, senza rumore.
      } catch {
        // Resume è un bonus: senza sessione o rete, resta nell'input.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  // Ogni stadio riparte dall'alto (il cambio di pannello non lascia a metà pagina).
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [stage]);

  const ready = photo && occasion && !submitting;

  const start = useCallback(async () => {
    if (!photo || !occasion) return;
    dispatch({ type: "submitStarted" });
    // Se il primo parere tarda oltre l'animazione, non lasciare il pannello fermo.
    const slowTimer = setTimeout(() => dispatch({ type: "scanSlow" }), 2900);
    try {
      const res = await fetch("/api/verdict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo, occasionSlug: occasion.slug }),
      });
      if (res.status === 422) {
        const d = await res.json().catch(() => ({} as Record<string, unknown>));
        dispatch({
          type: "submitFailed",
          message:
            (d as { error?: string }).error ??
            "Non vedo un outfit. Riprova con una foto a figura intera.",
        });
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json();
      void track("verdict_ai", {
        verdict: (d.verdict as AiVerdict).verdict,
        unsafe: (d.verdict as AiVerdict).unsafe_content,
      });
      dispatch({ type: "verdictReceived", verdict: d.verdict as AiVerdict });
    } catch {
      dispatch({ type: "submitFailed", message: "Il primo parere non è arrivato. Riprova." });
    } finally {
      clearTimeout(slowTimer);
    }
  }, [photo, occasion, dispatch]);

  const openingRef = useRef(false);
  // Momento di apertura del giurì fresco (per la metrica "tempo a 5 risposte").
  // Null su resume/409: il tempo reale di apertura non è ricostruibile.
  const openedAtRef = useRef<number | null>(null);
  const openJury = useCallback(async (allowAi: boolean) => {
    if (openingRef.current) return;
    openingRef.current = true;
    dispatch({ type: "juryOpenStarted" });
    try {
      let fill = allowAi;
      let res = await fetch("/api/jury/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        ...(allowAi ? { body: JSON.stringify({ allowAi: true }) } : {}),
      });
      if (res.status === 402) {
        const d402 = await res.json().catch(() => ({} as Record<string, unknown>));
        // Il server accetta il fill AI dichiarato (contratto allowAi): l'utente
        // ha già cliccato "Procedi comunque" — intento esplicito. Ritenta.
        if ((d402 as { allowAnyway?: boolean }).allowAnyway && !allowAi) {
          fill = true;
          res = await fetch("/api/jury/open", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ allowAi: true }),
          });
        }
      }
      const d = await res.json().catch(() => ({} as Record<string, unknown>));
      // 409 (contratto Fix-A): la giurì è già aperta (doppio click, concorrenza).
      // Con requestId si riprende la live view di quella giurì: la live ha già
      // retry della summary. Nessun errore, nessun loop.
      if (res.status === 409 && (d as { requestId?: string }).requestId) {
        openedAtRef.current = null;
        dispatch({
          type: "juryOpened",
          requestId: (d as { requestId: string }).requestId,
          // La 409 non porta la deadline: parte da adesso (il giurì vero può
          // chiudere prima — la retry della summary lo copre).
          deadline: new Date().toISOString(),
          aiFill: fill,
        });
        return;
      }
      if (res.ok && (d as { requestId?: string }).requestId) {
        // Fill AI dichiarato: evento dedicato (spec §3, ANALYTICS.md).
        if (fill) void track("jury_ai_fill");
        openedAtRef.current = Date.now();
        dispatch({
          type: "juryOpened",
          requestId: (d as { requestId: string }).requestId,
          deadline: (d as { deadline: string }).deadline,
          aiFill: fill,
        });
      } else {
        void track("jury_open_failed", {
          status: res.status,
          message: (d as { error?: string }).error ?? "Giurì non aperto. Riprova.",
        });
        dispatch({ type: "juryOpenFailed", message: (d as { error?: string }).error ?? "Giurì non aperto. Riprova." });
      }
    } catch {
      void track("jury_open_failed", { status: null, message: "Giurì non aperto. Riprova." });
      dispatch({ type: "juryOpenFailed", message: "Giurì non aperto. Riprova." });
    } finally {
      openingRef.current = false;
    }
  }, [dispatch]);

  const header = flowHeader(state);

  return (
    <section className="mx-auto max-w-[680px] px-6 pb-[110px] pt-[72px]">
      <div className="mb-11 text-center">
        <h2 className="font-display text-[clamp(28px,3.6vw,40px)] font-normal">{header.h}</h2>
        <p className="mt-2.5 text-[15px] text-muted">{header.sub}</p>
      </div>

      {/* STADIO 1: input */}
      {stage === "input" && (
        <div className={stage === "input" ? "animate-fade" : ""}>
          <PhotoDrop
            photo={photo}
            onPhoto={(dataUrl) => {
              void track("photo_added");
              dispatch({ type: "photoSelected", photo: dataUrl });
            }}
          />

          <p className="mb-3.5 mt-[34px] font-mono text-[11.5px] uppercase tracking-[0.18em] text-muted">
            Per cosa?
          </p>
          <OccasionChips
            occasions={occasions}
            selected={occasion?.slug ?? null}
            onSelect={(slug) => {
              void track("occasion_selected", { slug });
              dispatch({ type: "occasionSelected", slug });
            }}
          />

          <button
            type="button"
            disabled={!ready}
            onClick={start}
            className="mt-[34px] w-full rounded-[14px] bg-gold py-[18px] text-base font-semibold tracking-[0.04em] text-ink transition-colors enabled:hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-35"
          >
            Vado bene?
          </button>
          <p className="mt-3.5 text-center text-[12.5px]">
            {error ? (
              <span role="alert" className="text-bad">{error}</span>
            ) : ready ? (
              "Tutto pronto."
            ) : !photo ? (
              "Aggiungi una foto per continuare"
            ) : (
              "Scegli l'occasione per continuare"
            )}
          </p>
        </div>
      )}

      {/* STADIO 2: scan */}
      {stage === "scan" && (
        <div>
          <ScanLines onDone={() => { /* sostituito dall'arrivo della risposta */ }} />
          <p aria-live="polite" className="mt-4 min-h-4 text-center text-[12.5px] text-muted">
            {scanSlow ? "Ancora un attimo…" : ""}
          </p>
        </div>
      )}

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
              onClick={() => dispatch({ type: "gateRequested" })}
            >
              Chiedi a cinque persone vere
            </button>
          </div>
        </div>
      )}

      {/* STADIO 4: prima rispondi tu */}
      {stage === "gate" && (
        <div className="animate-fade">
          {error && (
            <p role="alert" className="mb-3 text-center text-[13px] text-bad">{error}</p>
          )}
          <VoteGate
            onCreditFull={(credit, opts) => {
              // Il credito server arriva dal gate (mirror nello stato).
              dispatch({ type: "creditSynced", credit });
              // Il momento dell'ansia: ogni apertura giurì passa da qui
              // (credito pieno, ricarica iniziale >= 5, "Procedi comunque").
              void track("jury_requested", { credit_before: credit });
              // Apri il giurì: con credito >= 5 scala 5 crediti; con "Procedi comunque"
              // (allowAi) il fill AI è dichiarato in UI.
              openJury(opts?.allowAi === true);
            }}
          />
        </div>
      )}

      {/* STADIO 5: stanno guardando */}
      {stage === "jury" && jury && (
        <div className="animate-fade">
          <JuryLive
            requestId={jury.id}
            deadline={jury.deadline}
            aiFill={state.aiFill}
            onClosed={(summary) => {
              // Metrica kill criterion "tempo a 5 risposte" (ANALYTICS.md):
              // solo sull'apertura fresca — su resume non è ricostruibile.
              const seconds = openedAtRef.current
                ? Math.round((Date.now() - openedAtRef.current) / 1000)
                : undefined;
              void track("jury_closed", {
                result: summary.result,
                human_votes: summary.human_votes,
                ai_votes: summary.ai_votes,
                ...(seconds !== undefined ? { seconds } : {}),
              });
              dispatch({ type: "summaryReceived", summary });
            }}
          />
        </div>
      )}

      {/* STADIO 6: ecco */}
      {stage === "final" && summary && occasion && (
        <div className="animate-fade">
          <VerdictCard
            summary={summary}
            occasion={occasion.label_it}
            requestId={jury?.id ?? ""}
            onNewLook={() => dispatch({ type: "reset" })}
          />
        </div>
      )}
    </section>
  );
}
