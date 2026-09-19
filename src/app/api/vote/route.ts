import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { moderateNote } from "@/lib/moderation";
import { VoteRequest } from "@/lib/contracts";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/vote — { requestId, verdict, note? } → moderazione, salva il voto,
 * incrementa jury_credit e juror_score, restituisce { credit }.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Richiesta non valida." }, { status: 400 });
  }
  const parsed = VoteRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Richiesta non valida." }, { status: 400 });
  }
  const { requestId, verdict, note } = parsed.data;

  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Serve un account per votare." }, { status: 401 });
  }

  // La request deve essere in jury_open e non propria.
  const { data: request, error: rErr } = await supabase
    .from("requests")
    .select("id, status, user_id, jury_deadline_at")
    .eq("id", requestId)
    .single();
  if (rErr || !request) {
    return NextResponse.json({ error: "Richiesta non trovata." }, { status: 404 });
  }
  if (request.status !== "jury_open") {
    return NextResponse.json({ error: "Il giurì non è più aperto." }, { status: 409 });
  }
  if (request.user_id === userId) {
    return NextResponse.json({ error: "Non puoi votare la tua richiesta." }, { status: 403 });
  }

  // Moderazione della nota (se presente).
  let noteStatus: "ok" | "filtered" | "flagged" = "ok";
  if (note && note.trim().length > 0) {
    try {
      const mod = await moderateNote(note);
      noteStatus = mod.status;
    } catch {
      // Moderazione irraggiungibile: la nota viene filtrata per sicurezza.
      noteStatus = "filtered";
    }
  }

  // INSERT con unique(request_id, juror_id): un secondo voto fallisce qui.
  const { error: vErr } = await supabase.from("votes").insert({
    request_id: requestId,
    juror_id: userId,
    verdict,
    note: noteStatus === "ok" ? note : null,
    note_status: noteStatus,
  });

  if (vErr) {
    if (vErr.code === "23505") {
      return NextResponse.json({ error: "Hai già votato questa richiesta." }, { status: 409 });
    }
    return NextResponse.json({ error: "Voto non registrato. Riprova." }, { status: 500 });
  }

  // Credito e punteggio: jury_credit += 1, juror_score += 1 (§6.4).
  const { data: user } = await supabase
    .from("users")
    .select("jury_credit, juror_score")
    .eq("id", userId)
    .single();

  const credit = (user?.jury_credit ?? 0) + 1;
  const score = (user?.juror_score ?? 0) + 1;
  await supabase.from("users").update({ jury_credit: credit, juror_score: score }).eq("id", userId);

  return NextResponse.json({ credit, noteStatus });
}
