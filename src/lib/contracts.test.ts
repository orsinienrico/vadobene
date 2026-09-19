import { describe, it, expect } from "vitest";
import { AiVerdict, JurySummary, NoteModeration, VerdictRequest, VoteRequest } from "./contracts";

describe("AiVerdict", () => {
  it("accetta un verdetto valido", () => {
    const v = {
      verdict: "tweak",
      tweak: "Cambia le scarpe.",
      one_liner: "Sembri già assunto. Tranne ai piedi.",
      confidence: "high",
      unsafe_content: false,
    };
    expect(AiVerdict.parse(v)).toEqual(v);
  });

  it("accetta tweak null e unsafe_content true", () => {
    const v = {
      verdict: "yes",
      tweak: null,
      one_liner: "Funziona così com'è.",
      confidence: "low",
      unsafe_content: true,
    };
    expect(() => AiVerdict.parse(v)).not.toThrow();
  });

  it("rifiuta un verdetto fuori enum", () => {
    expect(() => AiVerdict.parse({ verdict: "maybe" })).toThrow();
  });

  it("rifiuta one_liner oltre 90 caratteri", () => {
    const v = { verdict: "yes", tweak: null, one_liner: "x".repeat(91), confidence: "high", unsafe_content: false };
    expect(() => AiVerdict.parse(v)).toThrow();
  });

  it("rifiuta se manca unsafe_content", () => {
    expect(() => AiVerdict.parse({ verdict: "no", tweak: null, one_liner: "ok", confidence: "med" })).toThrow();
  });
});

describe("JurySummary", () => {
  const base = { yes: 4, tweak: 1, no: 0, human_votes: 5, ai_votes: 0, result: "yes", top_tweak: null, quote: "Vai tranquillo.", headline: "Sì. 4 su 5." };

  it("accetta un riassunto valido", () => {
    expect(JurySummary.parse(base)).toBeTruthy();
  });

  it("rifiuta punteggi decimali", () => {
    expect(() => JurySummary.parse({ ...base, yes: 3.5 })).toThrow();
  });

  it("rifiuta result fuori enum", () => {
    expect(() => JurySummary.parse({ ...base, result: "maybe" })).toThrow();
  });
});

describe("NoteModeration", () => {
  it("accetta status ok senza reason", () => {
    expect(NoteModeration.parse({ status: "ok" })).toEqual({ status: "ok" });
  });

  it("accetta filtered con reason body", () => {
    expect(NoteModeration.parse({ status: "filtered", reason: "body" })).toBeTruthy();
  });

  it("rifiuta reason fuori enum", () => {
    expect(() => NoteModeration.parse({ status: "filtered", reason: "taste" })).toThrow();
  });
});

describe("VerdictRequest", () => {
  it("accetta foto e occasione", () => {
    expect(VerdictRequest.parse({ photo: "aGVsbG8=", occasionSlug: "colloquio" })).toBeTruthy();
  });

  it("rifiuta occasione vuota", () => {
    expect(() => VerdictRequest.parse({ photo: "aGVsbG8=", occasionSlug: "" })).toThrow();
  });

  it("rifiuta foto mancante", () => {
    expect(() => VerdictRequest.parse({ occasionSlug: "colloquio" })).toThrow();
  });
});

describe("VoteRequest", () => {
  it("accetta voto con nota", () => {
    const v = { requestId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301", verdict: "yes", note: "Vai tranquillo." };
    expect(VoteRequest.parse(v)).toBeTruthy();
  });

  it("accetta voto senza nota", () => {
    const v = { requestId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301", verdict: "no" };
    expect(VoteRequest.parse(v)).toBeTruthy();
  });

  it("rifiuta uuid malformato", () => {
    expect(() => VoteRequest.parse({ requestId: "nope", verdict: "yes" })).toThrow();
  });

  it("rifiuta nota oltre 280 caratteri", () => {
    const v = { requestId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301", verdict: "yes", note: "x".repeat(281) };
    expect(() => VoteRequest.parse(v)).toThrow();
  });
});
