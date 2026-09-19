import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { anthropic } from "@/lib/anthropic";
import { AiVerdict as AiVerdictT, JurySummary as JurySummaryT } from "@/lib/contracts";
import { summarizeJury } from "@/lib/summarize";
import { sendEmail, juryClosedEmail } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Cron ogni 30s — Fase 3. Protetta da CRON_SECRET (header o query param).
 * Chiude le jury_open con 5 voti o deadline scaduta; riempi i voti mancanti
 * con AI (is_ai=true); calcola JurySummary e salva in jury_summary.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided =
      req.headers.get("authorization")?.replace("Bearer ", "") ??
      req.nextUrl.searchParams.get("secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // Jury scadute o complete ma non ancora chiuse.
  const { data: open, error } = await supabase
    .from("requests")
    .select("id, occasion_id, custom_occasion, jury_deadline_at, votes_target, user_id")
    .eq("status", "jury_open")
    .or(`jury_deadline_at.lte.${now}`);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!open || open.length === 0) {
    return NextResponse.json({ closed: 0 });
  }

  const closed: string[] = [];

  for (const request of open) {
    const { data: votes } = await supabase
      .from("votes")
      .select("verdict, note, note_status, is_ai")
      .eq("request_id", request.id);

    const target = request.votes_target ?? 5;
    const current = votes ?? [];

    if (current.length < target) {
      // Riempi i voti mancanti con Anthropic (is_ai=true).
      const missing = target - current.length;
      const aiVotes = await fillWithAiVotes(supabase, request, missing);
      current.push(...aiVotes.map((v) => ({ ...v, note_status: "ok" as const })));
    }

    const summary = JurySummaryT.parse(summarizeJury(current));

    const { error: closeErr } = await supabase
      .from("requests")
      .update({ status: "jury_closed", jury_summary: summary })
      .eq("id", request.id);
    if (!closeErr) {
      closed.push(request.id);

      // Email di chiusura giurì (Fase 4): "Ecco. Sì, 4 su 5." con link alla card.
      const { data: owner } = await supabase
        .from("users")
        .select("email")
        .eq("id", request.user_id)
        .single();
      if (owner?.email) {
        const { subject, html } = juryClosedEmail({
          headline: summary.headline,
          cardUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://vadobene.app"}/c/${request.id}`,
        });
        await sendEmail(owner.email, subject, html);
      }
    }
  }

  return NextResponse.json({ closed: closed.length, ids: closed });
}

/** Genera i voti AI mancanti con lo stesso prompt del verdetto (singolo voto). */
async function fillWithAiVotes(
  supabase: ReturnType<typeof createAdminClient>,
  request: { id: string; occasion_id: number | null; custom_occasion: string | null },
  missing: number
): Promise<{ verdict: "yes" | "tweak" | "no"; note: string | null; is_ai: boolean }[]> {
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

  const generated: { verdict: "yes" | "tweak" | "no"; note: string | null; is_ai: boolean }[] = [];

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
      if (text && text.type === "text") {
        const match = text.text.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]) as { verdict: string; note?: string };
          if (["yes", "tweak", "no"].includes(parsed.verdict)) {
            const vote = {
              verdict: parsed.verdict as "yes" | "tweak" | "no",
              note: parsed.note?.slice(0, 60) ?? null,
              is_ai: true,
            };
            await supabase.from("votes").insert({
              request_id: request.id,
              juror_id: null,
              verdict: vote.verdict,
              note: vote.note,
              is_ai: true,
              note_status: "ok",
            });
            generated.push(vote);
            continue;
          }
        }
      }
    } catch {
      // AI non disponibile: procedi senza questo voto.
    }
  }

  return generated;
}
