import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const JURY_DURATION_SECONDS = 180; // 3 minuti

/**
 * POST /api/jury/open — Fase 3.
 * Verifica jury_credit >= 5, scala 5, imposta status='jury_open'
 * e jury_deadline_at = now() + 3 min.
 */
export async function POST() {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Serve un account." }, { status: 401 });
  }

  const { data: user, error: uErr } = await supabase
    .from("users")
    .select("jury_credit, plan")
    .eq("id", userId)
    .single();
  if (uErr || !user) {
    return NextResponse.json({ error: "Profilo non trovato." }, { status: 404 });
  }

  // Trova la richiesta più recente dell'utente in ai_done.
  const { data: request, error: rErr } = await supabase
    .from("requests")
    .select("id, status")
    .eq("user_id", userId)
    .eq("status", "ai_done")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (rErr || !request) {
    return NextResponse.json({ error: "Nessuna richiesta pronta per il giurì." }, { status: 404 });
  }

  const deadline = new Date(Date.now() + JURY_DURATION_SECONDS * 1000).toISOString();

  if (user.jury_credit >= 5) {
    // Scala 5 crediti e apre il giurì.
    const { error: updErr } = await supabase
      .from("users")
      .update({ jury_credit: user.jury_credit - 5 })
      .eq("id", userId);
    if (updErr) {
      return NextResponse.json({ error: "Credito non aggiornato." }, { status: 500 });
    }
  } else {
    // Senza credito: consenti ma dichiara che i voti mancanti saranno AI.
    return NextResponse.json(
      {
        error: "Credito insufficiente.",
        credit: user.jury_credit,
        allowAnyway: true, // il voto mancante arriverà come parere automatico dichiarato
      },
      { status: 402 }
    );
  }

  const { error: reqErr } = await supabase
    .from("requests")
    .update({ status: "jury_open", jury_deadline_at: deadline, votes_target: 5 })
    .eq("id", request.id);

  if (reqErr) {
    return NextResponse.json({ error: "Giurì non aperto. Riprova." }, { status: 500 });
  }

  return NextResponse.json({
    requestId: request.id,
    deadline,
    durationSeconds: JURY_DURATION_SECONDS,
  });
}
