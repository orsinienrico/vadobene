import { describe, it, expect } from "vitest";
import { summarizeJury } from "./summarize";
import { JurySummary } from "./contracts";

describe("summarizeJury", () => {
  it("4 yes + 1 tweak → yes, 'Sì. 4 su 5.'", () => {
    const s = summarizeJury([
      { verdict: "yes", note: "Vai tranquillo." },
      { verdict: "yes" },
      { verdict: "yes" },
      { verdict: "yes" },
      { verdict: "tweak", note: "Le scarpe no, cambia solo quelle." },
    ]);
    expect(s.result).toBe("yes");
    expect(s.headline).toBe("Sì. 4 su 5.");
    expect(s.human_votes).toBe(5);
    expect(s.ai_votes).toBe(0);
    expect(s.top_tweak).toBe("Le scarpe no, cambia solo quelle.");
    expect(s.quote).toBe("Vai tranquillo.");
    expect(() => JurySummary.parse(s)).not.toThrow();
  });

  it("3 no + 2 yes → no, 'No. 3 su 5.'", () => {
    const s = summarizeJury([
      { verdict: "no" },
      { verdict: "no" },
      { verdict: "no" },
      { verdict: "yes" },
      { verdict: "yes" },
    ]);
    expect(s.result).toBe("no");
    expect(s.headline).toBe("No. 3 su 5.");
  });

  it("2+2+1 → tweak, 'Sì, con una modifica.'", () => {
    const s = summarizeJury([
      { verdict: "yes" },
      { verdict: "yes" },
      { verdict: "tweak" },
      { verdict: "tweak" },
      { verdict: "no" },
    ]);
    expect(s.result).toBe("tweak");
    expect(s.headline).toBe("Sì, con una modifica.");
  });

  it("conta umani e AI separatamente (3 persone + 2 AI)", () => {
    const s = summarizeJury([
      { verdict: "yes" },
      { verdict: "tweak", is_ai: true },
      { verdict: "yes", is_ai: true },
      { verdict: "yes" },
      { verdict: "tweak" },
    ]);
    expect(s.human_votes).toBe(3);
    expect(s.ai_votes).toBe(2);
    expect(() => JurySummary.parse(s)).not.toThrow();
  });

  it("quote e top_tweak ignorano le note filtrate", () => {
    const s = summarizeJury([
      { verdict: "tweak", note: "Troppo magra così", note_status: "filtered" },
      { verdict: "tweak", note: "Cambia le scarpe." },
      { verdict: "yes" },
      { verdict: "yes" },
      { verdict: "yes" },
    ]);
    expect(s.top_tweak).toBe("Cambia le scarpe.");
    expect(s.quote).toBe("Cambia le scarpe.");
  });

  it("top_tweak: la nota più frequente vince", () => {
    const s = summarizeJury([
      { verdict: "tweak", note: "Cambia le scarpe." },
      { verdict: "tweak", note: "Cambia le scarpe." },
      { verdict: "tweak", note: "Togli la giacca." },
      { verdict: "yes" },
      { verdict: "yes" },
    ]);
    expect(s.top_tweak).toBe("Cambia le scarpe.");
  });

  it("nessuna nota → top_tweak e quote null", () => {
    const s = summarizeJury([
      { verdict: "yes" },
      { verdict: "yes" },
      { verdict: "yes" },
      { verdict: "yes" },
      { verdict: "yes" },
    ]);
    expect(s.top_tweak).toBeNull();
    expect(s.quote).toBeNull();
  });
});
