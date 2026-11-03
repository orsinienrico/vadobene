import { describe, it, expect } from "vitest";
import { MAX_PER_SESSION, rankCandidates, type QueueCandidate } from "./queue-rank";

/**
 * Ranking della coda di voto — §6.4. Logica estratta da /api/queue/next
 * (comportamento invariato): peso "meno voti prima", tie-break per deadline
 * più vicina, Pro (+1 posizione) prima, cap 20 voti per sessione.
 */

const cand = (id: string, over: Partial<QueueCandidate> = {}): QueueCandidate => ({
  id,
  jury_deadline_at: "2026-09-26T12:00:00.000Z",
  votes_target: 5,
  ...over,
});

describe("rankCandidates — peso meno voti prima", () => {
  it("una request con meno voti precede una con più voti, anche con deadline più lontana", () => {
    const a = cand("a", { jury_deadline_at: "2026-09-26T10:00:00.000Z" });
    const b = cand("b", { jury_deadline_at: "2026-09-26T18:00:00.000Z" });
    const counts = new Map([
      ["a", 2],
      ["b", 1],
    ]);
    const ranked = rankCandidates([a, b], counts);
    expect(ranked.map((r) => r.id)).toEqual(["b", "a"]);
  });
});

describe("rankCandidates — tie-break per deadline", () => {
  it("a parità di voti vince la deadline più vicina", () => {
    const a = cand("a", { jury_deadline_at: "2026-09-26T18:00:00.000Z" });
    const b = cand("b", { jury_deadline_at: "2026-09-26T10:00:00.000Z" });
    const counts = new Map([
      ["a", 1],
      ["b", 1],
    ]);
    const ranked = rankCandidates([a, b], counts);
    expect(ranked.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("a parità di voti e deadline resta l'ordine d'ingresso (sort stabile)", () => {
    const a = cand("a");
    const b = cand("b");
    const c = cand("c");
    const counts = new Map([
      ["a", 1],
      ["b", 1],
      ["c", 1],
    ]);
    const ranked = rankCandidates([a, b, c], counts);
    expect(ranked.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});

describe("rankCandidates — Pro-priority", () => {
  it("le richieste Pro (votes_target 10) precedono le Free a parità di voti e deadline", () => {
    const free = cand("free", { votes_target: 5 });
    const pro = cand("pro", { votes_target: 10 });
    const counts = new Map([
      ["free", 1],
      ["pro", 1],
    ]);
    const ranked = rankCandidates([free, pro], counts);
    expect(ranked[0].id).toBe("pro");
  });

  it("il conteggio vince sempre sulla priorità Pro: meno voti prima anche per una Pro", () => {
    const pro = cand("pro", { votes_target: 10, jury_deadline_at: "2026-09-26T10:00:00.000Z" });
    const free = cand("free", { votes_target: 5, jury_deadline_at: "2026-09-26T18:00:00.000Z" });
    const counts = new Map([
      ["pro", 3],
      ["free", 0],
    ]);
    const ranked = rankCandidates([pro, free], counts);
    expect(ranked.map((r) => r.id)).toEqual(["free", "pro"]);
  });
});

describe("rankCandidates — casi limite", () => {
  it("i voti mancanti nella mappa contano come zero", () => {
    const a = cand("a");
    const b = cand("b");
    const counts = new Map([["b", 1]]);
    const ranked = rankCandidates([a, b], counts);
    expect(ranked.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("non muta l'array d'ingresso", () => {
    const a = cand("a", { jury_deadline_at: "2026-09-26T18:00:00.000Z" });
    const b = cand("b", { jury_deadline_at: "2026-09-26T10:00:00.000Z" });
    const input = [a, b];
    rankCandidates(input, new Map());
    expect(input.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("coda vuota → array vuoto", () => {
    expect(rankCandidates([], new Map())).toEqual([]);
  });
});

describe("cap di sessione §6.4", () => {
  it("max 20 carte per sessione di voto", () => {
    expect(MAX_PER_SESSION).toBe(20);
  });
});
