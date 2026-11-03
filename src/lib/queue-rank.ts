/**
 * Ranking della coda di voto — §6.4. Estratto da /api/queue/next come logica
 * pura (testabile in src/lib/queue-rank.test.ts, comportamento invariato).
 * Peso: richieste con meno voti prima; tie-break per deadline più vicina;
 * Pro (+1 posizione, votes_target > 5) prima nel pacchetto ordinato.
 */
export const MAX_PER_SESSION = 20; // §6.4: max 20 carte per sessione di voto

export type QueueCandidate = {
  id: string;
  jury_deadline_at: string | null;
  votes_target: number | null;
};

/**
 * Ordina i candidati per la coda di voto: le richieste Pro (votes_target > 5)
 * precedono le altre, poi conta il peso "meno voti prima" con tie-break sulla
 * deadline più vicina. Ordine stabile a parità di tutto.
 */
export function rankCandidates<T extends QueueCandidate>(
  candidates: T[],
  counts: Map<string, number>
): T[] {
  // Pro: priorità +1 (la coda serve prima le richieste degli utenti Pro;
  // votes_target=10 marca le richieste Pro, vengono da /api/jury/open con plan pro).
  const proFirst = candidates.filter((r) => (r.votes_target ?? 0) > 5);
  const others = candidates.filter((r) => !proFirst.includes(r));

  return [...proFirst, ...others].sort((a, b) => {
    const ca = counts.get(a.id) ?? 0;
    const cb = counts.get(b.id) ?? 0;
    if (ca !== cb) return ca - cb;
    return (a.jury_deadline_at ?? "").localeCompare(b.jury_deadline_at ?? "");
  });
}
