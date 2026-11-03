import { describe, it, expect } from "vitest";
import { flowReducer, initialFlowState, flowHeader, FLOW_TITLES } from "./flow-machine";
import type { FlowState } from "./flow-machine";
import type { AiVerdict, JurySummary } from "./contracts";

const VERDICT: AiVerdict = {
  verdict: "tweak",
  tweak: "Cambia le scarpe.",
  one_liner: "Sembri già assunto. Tranne ai piedi.",
  confidence: "high",
  unsafe_content: false,
};

const SUMMARY: JurySummary = {
  yes: 4,
  tweak: 1,
  no: 0,
  human_votes: 5,
  ai_votes: 0,
  result: "yes",
  top_tweak: null,
  quote: "Vai tranquillo.",
  headline: "Sì. 4 su 5.",
};

const OCCASIONS = [
  { slug: "colloquio", label_it: "Colloquio" },
  { slug: "matrimonio", label_it: "Matrimonio" },
];

/** Da input a gate: percorso felice fino allo stadio 4. */
function toGate(): FlowState {
  let s = initialFlowState;
  s = flowReducer(s, { type: "occasionsLoaded", occasions: OCCASIONS });
  s = flowReducer(s, { type: "photoSelected", photo: "data:image/jpeg;base64,aaa" });
  s = flowReducer(s, { type: "occasionSelected", slug: "colloquio" });
  s = flowReducer(s, { type: "submitStarted" });
  s = flowReducer(s, { type: "verdictReceived", verdict: VERDICT });
  s = flowReducer(s, { type: "gateRequested" });
  return s;
}

function toJury(aiFill = false): FlowState {
  return flowReducer(toGate(), {
    type: "juryOpened",
    requestId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    deadline: "2026-09-26T12:03:00Z",
    aiFill,
  });
}

describe("flusso completo input → final", () => {
  it("lo stato iniziale è input senza dati", () => {
    expect(initialFlowState.stage).toBe("input");
    expect(initialFlowState.photo).toBeNull();
    expect(initialFlowState.occasion).toBeNull();
    expect(initialFlowState.verdict).toBeNull();
    expect(initialFlowState.jury).toBeNull();
    expect(initialFlowState.summary).toBeNull();
    expect(initialFlowState.aiFill).toBe(false);
    expect(initialFlowState.credit).toBe(0);
  });

  it("input → scan → ai → gate → jury → final", () => {
    let s = initialFlowState;
    s = flowReducer(s, { type: "occasionsLoaded", occasions: OCCASIONS });
    s = flowReducer(s, { type: "photoSelected", photo: "data:image/jpeg;base64,aaa" });
    s = flowReducer(s, { type: "occasionSelected", slug: "colloquio" });
    expect(s.occasion).toEqual({ slug: "colloquio", label_it: "Colloquio" });
    expect(s.stage).toBe("input");

    s = flowReducer(s, { type: "submitStarted" });
    expect(s.stage).toBe("scan");
    expect(s.submitting).toBe(true);
    expect(s.error).toBeNull();
    expect(s.scanSlow).toBe(false);

    s = flowReducer(s, { type: "verdictReceived", verdict: VERDICT });
    expect(s.stage).toBe("ai");
    expect(s.submitting).toBe(false);
    expect(s.verdict).toEqual(VERDICT);

    s = flowReducer(s, { type: "gateRequested" });
    expect(s.stage).toBe("gate");

    s = flowReducer(s, {
      type: "juryOpened",
      requestId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      deadline: "2026-09-26T12:03:00Z",
      aiFill: false,
    });
    expect(s.stage).toBe("jury");
    expect(s.jury?.id).toBe("3f2504e0-4f89-11d3-9a0c-0305e82c3301");
    expect(s.jury?.deadline).toBe("2026-09-26T12:03:00Z");

    s = flowReducer(s, { type: "summaryReceived", summary: SUMMARY });
    expect(s.stage).toBe("final");
    expect(s.summary).toEqual(SUMMARY);
  });

  it("occasionSelected risolve lo slug tra le occasioni caricate", () => {
    let s = flowReducer(initialFlowState, { type: "occasionsLoaded", occasions: OCCASIONS });
    s = flowReducer(s, { type: "occasionSelected", slug: "matrimonio" });
    expect(s.occasion).toEqual({ slug: "matrimonio", label_it: "Matrimonio" });
  });

  it("occasionSelected con slug sconosciuto → occasion null (parità con `?? null`)", () => {
    let s = flowReducer(initialFlowState, { type: "occasionsLoaded", occasions: OCCASIONS });
    s = flowReducer(s, { type: "occasionSelected", slug: "ballo" });
    expect(s.occasion).toBeNull();
  });
});

describe("submit (input → ai)", () => {
  it("submitStarted azzera errore e scanSlow, passa a scan con submitting", () => {
    let s = initialFlowState;
    s = flowReducer(s, { type: "occasionsLoaded", occasions: OCCASIONS });
    s = flowReducer(s, { type: "photoSelected", photo: "aaa" });
    s = flowReducer(s, { type: "occasionSelected", slug: "colloquio" });
    s = flowReducer(s, { type: "submitStarted" });
    s = flowReducer(s, { type: "scanSlow" });
    // seconda fotografia: l'errore del giro prima e lo scanSlow vengono azzerati
    s = flowReducer(s, { type: "submitStarted" });
    expect(s.stage).toBe("scan");
    expect(s.submitting).toBe(true);
    expect(s.error).toBeNull();
    expect(s.scanSlow).toBe(false);
  });

  it("scanSlow si attiva e non si riattiva (stessa reference se già vero)", () => {
    let s = flowReducer(initialFlowState, { type: "scanSlow" });
    expect(s.scanSlow).toBe(true);
    expect(flowReducer(s, { type: "scanSlow" })).toBe(s);
  });

  it("verdictReceived passa ad ai e rilascia submitting (come il finally)", () => {
    let s = flowReducer(initialFlowState, { type: "submitStarted" });
    s = flowReducer(s, { type: "scanSlow" });
    s = flowReducer(s, { type: "verdictReceived", verdict: VERDICT });
    expect(s.stage).toBe("ai");
    expect(s.submitting).toBe(false);
    expect(s.verdict).toEqual(VERDICT);
  });

  it("422 unsafe → torna all'input con il messaggio", () => {
    let s = flowReducer(initialFlowState, { type: "submitStarted" });
    s = flowReducer(s, {
      type: "submitFailed",
      message: "Non vedo un outfit. Riprova con una foto a figura intera.",
    });
    expect(s.stage).toBe("input");
    expect(s.submitting).toBe(false);
    expect(s.error).toBe("Non vedo un outfit. Riprova con una foto a figura intera.");
  });

  it("errore di rete → stesso percorso del 422, messaggio generico", () => {
    let s = flowReducer(initialFlowState, { type: "submitStarted" });
    s = flowReducer(s, { type: "submitFailed", message: "Il primo parere non è arrivato. Riprova." });
    expect(s.stage).toBe("input");
    expect(s.submitting).toBe(false);
    expect(s.error).toBe("Il primo parere non è arrivato. Riprova.");
  });
});

describe("gate → jury (402/allowAnyway)", () => {
  it("juryOpened con credito porta in jury senza fill AI", () => {
    const s = toJury(false);
    expect(s.stage).toBe("jury");
    expect(s.aiFill).toBe(false);
    expect(s.jury).not.toBeNull();
  });

  it("402 → allowAnyway → retry con allowAi: aiFill true, fill dichiarato", () => {
    // Il retry 402 vive in Flow.tsx; il reducer riceve l'esito: aiFill=true.
    const s = toJury(true);
    expect(s.stage).toBe("jury");
    expect(s.aiFill).toBe(true);
  });

  it("juryOpenStarted cancella l'errore (inizio del tentativo)", () => {
    let s = toGate();
    s = flowReducer(s, { type: "juryOpenFailed", message: "Giurì non aperto. Riprova." });
    expect(s.error).toBe("Giurì non aperto. Riprova.");
    s = flowReducer(s, { type: "juryOpenStarted" });
    expect(s.error).toBeNull();
  });

  it("juryOpenFailed lascia il messaggio nel gate senza cambiare stadio", () => {
    const s = flowReducer(toGate(), { type: "juryOpenFailed", message: "Giurì non aperto. Riprova." });
    expect(s.stage).toBe("gate");
    expect(s.error).toBe("Giurì non aperto. Riprova.");
    expect(s.jury).toBeNull();
  });

  it("invariante: impossibile andare a jury senza requestId", () => {
    const s = toGate();
    const after = flowReducer(s, {
      type: "juryOpened",
      requestId: "",
      deadline: "2026-09-26T12:03:00Z",
      aiFill: false,
    });
    expect(after).toBe(s); // stato invariato, stessa reference
    expect(after.stage).toBe("gate");
  });

  it("creditSynced registra il credito server e non accetta negativi", () => {
    let s = flowReducer(initialFlowState, { type: "creditSynced", credit: 3 });
    expect(s.credit).toBe(3);
    s = flowReducer(s, { type: "creditSynced", credit: -2 });
    expect(s.credit).toBe(0);
  });
});

describe("chiusura e reset", () => {
  it("summaryReceived passa a final con la summary", () => {
    const s = flowReducer(toJury(), { type: "summaryReceived", summary: SUMMARY });
    expect(s.stage).toBe("final");
    expect(s.summary).toEqual(SUMMARY);
  });

  it("reset riporta a input mantenendo le occasioni", () => {
    let s = toJury();
    s = flowReducer(s, { type: "summaryReceived", summary: SUMMARY });
    s = flowReducer(s, { type: "reset" });
    expect(s.stage).toBe("input");
    expect(s.photo).toBeNull();
    expect(s.occasion).toBeNull();
    expect(s.verdict).toBeNull();
    expect(s.summary).toBeNull();
    expect(s.jury).toBeNull();
    expect(s.aiFill).toBe(false);
    expect(s.credit).toBe(0);
    expect(s.occasions).toEqual(OCCASIONS);
  });

  it("dopo il reset il flusso riparte pulito", () => {
    let s = toJury(true);
    s = flowReducer(s, { type: "reset" });
    s = flowReducer(s, { type: "photoSelected", photo: "bbb" });
    s = flowReducer(s, { type: "occasionSelected", slug: "colloquio" });
    s = flowReducer(s, { type: "submitStarted" });
    expect(s.stage).toBe("scan");
    expect(s.aiFill).toBe(false);
  });
});

describe("invarianti", () => {
  it("aiFill solo di fill dichiarato: nessuna azione oltre juryOpened lo imposta a true", () => {
    let s: FlowState = initialFlowState;
    s = flowReducer(s, { type: "occasionsLoaded", occasions: OCCASIONS });
    s = flowReducer(s, { type: "photoSelected", photo: "aaa" });
    s = flowReducer(s, { type: "occasionSelected", slug: "colloquio" });
    s = flowReducer(s, { type: "submitStarted" });
    s = flowReducer(s, { type: "scanSlow" });
    s = flowReducer(s, { type: "verdictReceived", verdict: VERDICT });
    s = flowReducer(s, { type: "gateRequested" });
    s = flowReducer(s, { type: "creditSynced", credit: 5 });
    s = flowReducer(s, { type: "summaryReceived", summary: SUMMARY });
    expect(s.aiFill).toBe(false);

    const withFill = flowReducer(toJury(), { type: "summaryReceived", summary: SUMMARY });
    expect(withFill.aiFill).toBe(false); // jury senza allowAi resta false

    const declared = toJury(true);
    expect(declared.aiFill).toBe(true); // solo il percorso 402/allowAi lo imposta
  });

  it("credit mai negativo attraverso transizioni arbitrarie", () => {
    let s = flowReducer(initialFlowState, { type: "creditSynced", credit: 999 });
    s = flowReducer(s, { type: "creditSynced", credit: 0 });
    expect(s.credit).toBe(0);
    s = flowReducer(s, { type: "creditSynced", credit: -100 });
    expect(s.credit).toBeGreaterThanOrEqual(0);
  });

  it("le transizioni sono pure: stesso stato + stessa azione = stesso risultato", () => {
    const s = toGate();
    const action = {
      type: "juryOpened",
      requestId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      deadline: "2026-09-26T12:03:00Z",
      aiFill: true,
    } as const;
    expect(flowReducer(s, action)).toEqual(flowReducer(s, action));
  });
});

describe("flowHeader", () => {
  it("negli stadi standard usa il titolo del prototipo", () => {
    for (const stage of ["input", "scan", "ai", "gate", "final"] as const) {
      expect(flowHeader({ stage, aiFill: false })).toEqual(FLOW_TITLES[stage]);
    }
    expect(flowHeader({ stage: "jury", aiFill: false })).toEqual(FLOW_TITLES.jury);
  });

  it("in jury con fill AI dichiara i pareri automatici (spec §3)", () => {
    expect(flowHeader({ stage: "jury", aiFill: true })).toEqual({
      h: "Il giurì è aperto",
      sub: "Tre minuti, alla cieca. Alcuni pareri saranno automatici.",
    });
  });
});
