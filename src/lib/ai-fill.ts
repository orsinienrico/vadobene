import type { SupabaseClient } from "@supabase/supabase-js";
import { anthropic } from "./anthropic";
import { AiFillVote } from "./contracts";
import { moderateNote } from "./moderation";

/** Voto AI di fill inserito in votes (is_ai=true, dichiarato). */
export type AiGeneratedVote = {
  verdict: "yes" | "tweak" | "no";
  note: string | null;
  note_status: "ok" | "filtered";
  is_ai: boolean;
};

/**
 * Genera i voti AI mancanti con lo stesso prompt del verdetto (singolo voto).
 * Estratto dal cron close-juries (comportamento invariato) per essere testato
 * in src/lib/ai-fill.test.ts con l'SDK Anthropic mockato.
 */
export async function fillWithAiVotes(
  supabase: SupabaseClient,
  request: { id: string; occasion_id: number | null; custom_occasion: string | null },
  missing: number
): Promise<AiGeneratedVote[]> {
  let occasionLabel = request.custom_occasion ?? "";
  if (request.occasion_id) {
    const { data: occ } = await supabase
      .from("occasions")
      .select("label_it")
      .eq("id", request.occasion_id)
      .single();
    occasionLabel = occ?.label_it ?? occasionLabel;
  }

  // Foto della request per il giudice AI.
  const { data: req } = await supabase
    .from("requests")
    .select("photo_path")
    .eq("id", request.id)
    .single();

  const generated: AiGeneratedVote[] = [];

  for (let i = 0; i < missing; i++) {
    try {
      let imageBase64: string | null = null;
      if (req?.photo_path) {
        const { data: file } = await supabase.storage.from("outfits").download(req.photo_path);
        if (file) {
          const buf = Buffer.from(await file.arrayBuffer());
          imageBase64 = buf.toString("base64");
        }
      }

      const response = await anthropic().messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 200,
        system:
          "Sei un parere onesto sull'adeguatezza di un outfit per un'occasione. Giudichi coerenza tra outfit e occasione, mai il corpo. Un solo verdetto: yes / tweak / no. Se tweak, aggiungi una sola modifica concreta, eseguibile in un minuto. Poi una riga breve come nota del giurato, diretta, mai crudele, mai entusiasta.",
        messages: [
          {
            role: "user",
            content: [
              ...(imageBase64
                ? [
                    {
                      type: "image" as const,
                      source: { type: "base64" as const, media_type: "image/jpeg" as const, data: imageBase64 },
                    },
                  ]
                : []),
              {
                type: "text" as const,
                text: `Occasione: ${occasionLabel}. Rispondi in JSON: {"verdict":"yes|tweak|no","note":"max 60 caratteri"}`,
              },
            ],
          },
        ],
      });

      const text = response.content.find((b) => b.type === "text");
      if (!text || text.type !== "text") continue;

      // Contratto Zod sull'output del giudice (CLAUDE.md): JSON non conforme o
      // verdict fuori enum → voto scartato.
      const match = text.text.match(/\{[\s\S]*\}/);
      if (!match) continue;
      let candidate: unknown;
      try {
        candidate = JSON.parse(match[0]);
      } catch {
        continue;
      }
      const parsed = AiFillVote.safeParse(candidate);
      if (!parsed.success) continue;

      // Nota AI di fill: troncata a 60, poi moderata come le note umane
      // (nessun giudizio sul corpo, mai). Fail-closed: filtered → nota null,
      // il voto conserva il verdetto.
      const rawNote = parsed.data.note?.trim().slice(0, 60) ?? "";
      let note: string | null = null;
      let noteStatus: "ok" | "filtered" = "ok";
      if (rawNote.length > 0) {
        try {
          const mod = await moderateNote(rawNote);
          if (mod.status === "ok") {
            note = rawNote;
          } else {
            noteStatus = "filtered";
          }
        } catch {
          // Moderazione irraggiungibile: fail-closed, nota scartata.
          noteStatus = "filtered";
        }
      }

      const vote = { verdict: parsed.data.verdict, note, note_status: noteStatus, is_ai: true };
      const { error: insErr } = await supabase.from("votes").insert({
        request_id: request.id,
        juror_id: null,
        verdict: vote.verdict,
        note: vote.note,
        is_ai: true,
        note_status: vote.note_status,
      });
      if (insErr) continue; // insert non riuscito: non conta come voto generato
      generated.push(vote);
    } catch {
      // AI non disponibile: procedi senza questo voto.
    }
  }

  return generated;
}
