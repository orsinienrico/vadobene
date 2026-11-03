import { useReducer, type Dispatch } from "react";
import type { AiVerdict, JurySummary } from "./contracts";

/**
 * Macchina a stati del flusso (PRODUCT-SPEC.md §5, prototipo #stage-*).
 * Reducer puro: nessun fetch, nessun effetto — le chiamate di rete vivono in
 * Flow.tsx e dispatchano azioni. Gli stadi: input → scan → ai → gate → jury → final.
 */

export type Occasion = { slug: string; label_it: string };

export type FlowStage = "input" | "scan" | "ai" | "gate" | "jury" | "final";

export type FlowState = {
  /** Lista occasioni (fetch iniziale, fuori dal flusso). */
  occasions: Occasion[];
  stage: FlowStage;
  photo: string | null;
  occasion: Occasion | null;
  verdict: AiVerdict | null;
  error: string | null;
  /** Fetch /api/verdict in volo. */
  submitting: boolean;
  /** L'animazione dello scan è finita prima della risposta. */
  scanSlow: boolean;
  /** Giurì aperto: id richiesta + deadline server. */
  jury: { id: string; deadline: string } | null;
  summary: JurySummary | null;
  /** Fill AI dichiarato (spec §3): vero solo via "Procedi comunque" (allowAi). */
  aiFill: boolean;
  /** Credito server riportato dal gate (mirror, mai negativo). */
  credit: number;
};

export const initialFlowState: FlowState = {
  occasions: [],
  stage: "input",
  photo: null,
  occasion: null,
  verdict: null,
  error: null,
  submitting: false,
  scanSlow: false,
  jury: null,
  summary: null,
  aiFill: false,
  credit: 0,
};

export type FlowAction =
  | { type: "occasionsLoaded"; occasions: Occasion[] }
  | { type: "photoSelected"; photo: string }
  | { type: "occasionSelected"; slug: string }
  | { type: "submitStarted" }
  | { type: "scanSlow" }
  | { type: "verdictReceived"; verdict: AiVerdict }
  | { type: "submitFailed"; message: string }
  | { type: "gateRequested" }
  | { type: "creditSynced"; credit: number }
  | { type: "juryOpenStarted" }
  | { type: "juryOpened"; requestId: string; deadline: string; aiFill: boolean }
  | { type: "juryOpenFailed"; message: string }
  | { type: "summaryReceived"; summary: JurySummary }
  | {
      type: "resumed";
      /** Giurì ancora aperta: live view con la deadline reale. */
      jury: { id: string; deadline: string } | null;
      /** Summary già pronta: final. */
      summary: JurySummary | null;
      /** Occasione della richiesta (per la card finale), se risolvibile. */
      occasion: Occasion | null;
    }
  | { type: "reset" };

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case "occasionsLoaded":
      return { ...state, occasions: action.occasions };

    case "photoSelected":
      return { ...state, photo: action.photo };

    case "occasionSelected":
      return {
        ...state,
        occasion: state.occasions.find((o) => o.slug === action.slug) ?? null,
      };

    case "submitStarted":
      return { ...state, stage: "scan", submitting: true, error: null, scanSlow: false };

    case "scanSlow":
      return state.scanSlow ? state : { ...state, scanSlow: true };

    case "verdictReceived":
      return { ...state, verdict: action.verdict, stage: "ai", submitting: false };

    // 422 (outfit non riconosciuto) o rete giù: torna all'input con il messaggio.
    case "submitFailed":
      return { ...state, error: action.message, stage: "input", submitting: false };

    case "gateRequested":
      return { ...state, stage: "gate" };

    case "creditSynced":
      return { ...state, credit: Math.max(0, action.credit) };

    case "juryOpenStarted":
      return { ...state, error: null };

    // Invariante: niente giurì senza requestId (Flow filtra già, il reducer ridifende).
    case "juryOpened": {
      if (!action.requestId) return state;
      return {
        ...state,
        jury: { id: action.requestId, deadline: action.deadline },
        aiFill: action.aiFill,
        stage: "jury",
        submitting: false,
      };
    }

    // Resta nel gate: il messaggio è visibile sopra il pannello e l'utente può riprovare.
    case "juryOpenFailed":
      return { ...state, error: action.message };

    case "summaryReceived":
      return { ...state, summary: action.summary, stage: "final" };

    // Resume (magic link /?resume=1): riporta l'utente allo stadio della sua
    // richiesta più recente, senza effetti collaterali server-side.
    case "resumed": {
      // Con summary pronta → final (serve anche l'occasione per la card).
      if (action.summary) {
        return {
          ...state,
          stage: "final",
          summary: action.summary,
          jury: action.jury,
          occasion: action.occasion ?? state.occasion,
        };
      }
      // Giurì ancora aperta → live view (deadline reale; il fill AI dello open
      // originale non è ricostruibile: si resta sul copy standard).
      if (action.jury) {
        return { ...state, stage: "jury", jury: action.jury, aiFill: false };
      }
      // Primo parere pronto ma giurì mai aperta: torna al gate — con credito
      // >= 5 il gate apre da solo (stesso percorso del flusso normale).
      return { ...state, stage: "gate" };
    }

    // "Nuovo look": azzeramento completo, le occasioni già cariche restano.
    case "reset":
      return { ...initialFlowState, occasions: state.occasions };
  }
}

/** Titolo del flusso per stadio (prototipo). */
export const FLOW_TITLES: Record<FlowStage, { h: string; sub: string }> = {
  input: { h: "Il tuo riflesso", sub: "Foto, occasione, trenta secondi." },
  scan: { h: "Inviato", sub: "Cinque secondi, non di più." },
  ai: { h: "Inviato", sub: "Cinque secondi, non di più." },
  gate: { h: "Prima rispondi tu", sub: "Cinque voti, poi la tua domanda entra in coda." },
  jury: { h: "Stanno guardando", sub: "Tre minuti, alla cieca." },
  final: { h: "Ecco.", sub: "Cinque risposte, una sola verità." },
};

/**
 * Header derivato: con fill AI dichiarato il copy non può promettere
 * giurati reali che non ci sono (spec §3).
 */
export function flowHeader(state: Pick<FlowState, "stage" | "aiFill">): { h: string; sub: string } {
  return state.stage === "jury" && state.aiFill
    ? { h: "Il giurì è aperto", sub: "Tre minuti, alla cieca. Alcuni pareri saranno automatici." }
    : FLOW_TITLES[state.stage];
}

/** Hook: state + dispatch del flusso. I fetch restano nei componenti. */
export function useFlowMachine(): [FlowState, Dispatch<FlowAction>] {
  return useReducer(flowReducer, initialFlowState);
}
