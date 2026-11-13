import { z } from "zod";

/**
 * Contratti AI — PRODUCT-SPEC.md §6.2. Fonte di verità per input e output.
 * Ogni risposta di Anthropic passa da qui prima di toccare il DB.
 */

export const AiVerdict = z.object({
  verdict: z.enum(["yes", "tweak", "no"]),
  tweak: z.string().nullable(), // una sola modifica concreta, o null
  one_liner: z.string().max(90), // la frase che resta
  confidence: z.enum(["low", "med", "high"]),
  unsafe_content: z.boolean(), // foto senza outfit, nudità, minori
});
export type AiVerdict = z.infer<typeof AiVerdict>;

export const JurySummary = z.object({
  yes: z.number().int(),
  tweak: z.number().int(),
  no: z.number().int(),
  human_votes: z.number().int(),
  ai_votes: z.number().int(),
  result: z.enum(["yes", "tweak", "no"]), // yes>=3 → yes; no>=3 → no; altrimenti tweak
  top_tweak: z.string().nullable(),
  quote: z.string().nullable(),
  headline: z.string(), // "Sì. 4 su 5." / "Sì, con una modifica." / "No. 3 su 5."
});
export type JurySummary = z.infer<typeof JurySummary>;

export const NoteModeration = z.object({
  status: z.enum(["ok", "filtered"]),
  reason: z.enum(["body", "age", "ethnicity", "insult", "other"]).optional(),
});
export type NoteModeration = z.infer<typeof NoteModeration>;

/**
 * Contratti di richiesta delle API route.
 */

export const VerdictRequest = z.object({
  photo: z.string().min(1).max(9_000_000), // bounded base64 (data URL accettato, strippato server-side)
  occasionSlug: z.string().min(1).max(64),
});
export type VerdictRequest = z.infer<typeof VerdictRequest>;

export const VoteRequest = z.object({
  requestId: z.string().uuid(),
  verdict: z.enum(["yes", "tweak", "no"]),
  note: z.string().max(280).optional(),
});
export type VoteRequest = z.infer<typeof VoteRequest>;

export const JuryOpenRequest = z.object({
  // true → senza credito sufficiente apre il giurì senza spendere: i voti
  // mancanti saranno fill AI alla chiusura, dichiarati (is_ai=true, spec §3).
  allowAi: z.boolean().optional(),
});
export type JuryOpenRequest = z.infer<typeof JuryOpenRequest>;

/**
 * Voto AI di fill (output del giudice nel cron close-juries). Il prompt chiede
 * {"verdict":"yes|tweak|no","note":"max 60 caratteri"}: verdict fuori enum o
 * JSON non conforme → voto scartato. La nota è troncata a 60 caratteri e
 * moderata fail-closed (moderateNote) prima dell'insert.
 */
export const AiFillVote = z.object({
  verdict: z.enum(["yes", "tweak", "no"]),
  note: z.string().max(280).nullable().optional(),
});
export type AiFillVote = z.infer<typeof AiFillVote>;
