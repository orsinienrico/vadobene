import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { JurySummary as JurySummaryT } from "@/lib/contracts";
import { summarizeJury } from "@/lib/summarize";
import { fillWithAiVotes } from "@/lib/ai-fill";
import { sendEmail, juryClosedEmail } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Cron ogni 30s — Fase 3. Protetta da CRON_SECRET (header o query param).
 * Chiude le jury_open con votes_target voti umani (chiusura anticipata, §6.3)
 * o deadline scaduta; riempi i voti mancanti con AI (is_ai=true, note moderate
 * fail-closed); calcola JurySummary e salva in jury_summary.
 * Idempotente: claim_jury_close (RPC atomica) — il secondo chiamante concorrente
 * riceve false e salta fill, summary ed email (P0-3). Se fill/summary/update/email
 * throw, la request torna jury_open (revert) e il prossimo giro riprova (P1).
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

  // Tutte le jury_open: la selezione finale è deadline scaduta OPPURE già
  // votes_target voti umani (la summary esiste appena arriva il 5° voto).
  const { data: allOpen, error } = await supabase
    .from("requests")
    .select("id, occasion_id, custom_occasion, jury_deadline_at, votes_target, user_id")
    .eq("status", "jury_open");

  if (error) return NextResponse.json({ error: "Cron non riuscito. Riprova." }, { status: 500 });
  if (!allOpen || allOpen.length === 0) {
    return NextResponse.json({ closed: 0 });
  }

  // Conteggio voti umani (group by request_id in node): is_ai = false.
  const { data: humanVoteRows, error: hvErr } = await supabase
    .from("votes")
    .select("request_id, is_ai")
    .eq("is_ai", false)
    .in(
      "request_id",
      allOpen.map((r) => r.id)
    );
  if (hvErr) return NextResponse.json({ error: "Cron non riuscito. Riprova." }, { status: 500 });

  const humanCounts = new Map<string, number>();
  for (const v of humanVoteRows ?? []) {
    humanCounts.set(v.request_id, (humanCounts.get(v.request_id) ?? 0) + 1);
  }

  const due = allOpen.filter((r) => {
    const expired = r.jury_deadline_at != null && r.jury_deadline_at <= now;
    const target = r.votes_target ?? 5;
    return expired || (humanCounts.get(r.id) ?? 0) >= target;
  });
  if (due.length === 0) {
    return NextResponse.json({ closed: 0 });
  }

  const closed: string[] = [];

  for (const request of due) {
    // Idempotenza: claim atomico jury_open → jury_closed. Il secondo chiamante
    // concorrente riceve false e NON esegue fill AI, summary né email.
    const { data: claimed, error: claimErr } = await supabase.rpc("claim_jury_close", {
      p_request_id: request.id,
    });
    if (claimErr || !claimed) continue;

    // Fill AI + summary + update + email in try/catch: se un passo throw
    // (Anthropic giù, Zod parse, update, email), la request torna jury_open e
    // il prossimo giro del cron riprova — mai una giurì chiusa senza summary
    // né email (P1: il claim da solo rendeva l'errore permanente).
    try {
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
        current.push(...aiVotes);
      }

      const summary = JurySummaryT.parse(summarizeJury(current));

      // Update finale della summary condizionato: solo se la request è ancora
      // jury_closed come da claim — mai un update alla cieca.
      const { error: closeErr } = await supabase
        .from("requests")
        .update({ jury_summary: summary })
        .eq("id", request.id)
        .eq("status", "jury_closed");
      if (closeErr) throw new Error(`summary update non riuscito: ${closeErr.message}`);

      closed.push(request.id);

      // Email di chiusura giurì (Fase 4), SOLO dopo l'update summary riuscito:
      // "Ecco. Sì, 4 su 5." con link alla card.
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
    } catch (err) {
      // Revert: la request torna jury_open (il claim è ancora nostro), il
      // prossimo giro del cron riprova fill/summary/email da capo. Idempotente:
      // i voti AI già inseriti contano come voti esistenti, nessun doppione.
      console.error("[close-juries] chiusura fallita, revert a jury_open", {
        requestId: request.id,
        err,
      });
      const { error: revertErr } = await supabase
        .from("requests")
        .update({ status: "jury_open" })
        .eq("id", request.id)
        .eq("status", "jury_closed");
      if (revertErr) {
        // Revert fallito: log critico. La request rimane jury_closed senza summary.
        // Questo è un fallimento permanente se non risolto manualmente.
        console.error("[close-juries] CRITICO: revert fallito, request orfana", {
          requestId: request.id,
          revertErr,
        });
      }
    }
  }

  return NextResponse.json({ closed: closed.length, ids: closed });
}
