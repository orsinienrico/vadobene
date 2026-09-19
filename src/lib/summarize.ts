/**
 * Riassunto del Giurì — regole §6.2: yes>=3 → yes; no>=3 → no; altrimenti tweak.
 * top_tweak = nota più frequente tra i tweak non filtrate; quote = prima nota non filtrata.
 * Usata dal cron close-juries (Fase 3) e testata in summarize.test.ts.
 */
import type { JurySummary as JurySummaryT } from "./contracts";

export function summarizeJury(
  votes: {
    verdict: "yes" | "tweak" | "no";
    note?: string | null;
    note_status?: string | null;
    is_ai?: boolean;
  }[]
): JurySummaryT {
  const c = { yes: 0, tweak: 0, no: 0 };
  let human = 0;
  let ai = 0;
  for (const v of votes) {
    c[v.verdict]++;
    if (v.is_ai) ai++;
    else human++;
  }
  const result: "yes" | "tweak" | "no" = c.yes >= 3 ? "yes" : c.no >= 3 ? "no" : "tweak";

  const tweakNotes = new Map<string, number>();
  for (const v of votes) {
    if (v.verdict === "tweak" && v.note && v.note_status !== "filtered" && v.note_status !== "flagged") {
      tweakNotes.set(v.note, (tweakNotes.get(v.note) ?? 0) + 1);
    }
  }
  let top_tweak: string | null = null;
  let max = 0;
  for (const [note, n] of tweakNotes) {
    if (n > max) {
      top_tweak = note;
      max = n;
    }
  }

  const quote =
    votes.find((v) => v.note && v.note_status !== "filtered" && v.note_status !== "flagged")?.note ??
    null;

  const headline =
    result === "yes"
      ? `Sì. ${c.yes} su 5.`
      : result === "no"
        ? `No. ${c.no} su 5.`
        : "Sì, con una modifica.";

  return { ...c, human_votes: human, ai_votes: ai, result, top_tweak, quote, headline };
}
