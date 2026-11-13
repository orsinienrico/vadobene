import { requireLiveInteractions } from "@/lib/launch-control";
import { requireTrustedMutation } from "@/lib/request-security";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { moderateNote } from "@/lib/moderation";
import { VoteRequest } from "@/lib/contracts";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/vote — { requestId, verdict, note? } → moderazione, salva il voto,
 * incrementa jury_credit e juror_score via RPC atomiche, restituisce { credit }.
 */
export async function POST(req: NextRequest) {
  const unavailable = requireLiveInteractions();
  if (unavailable) return unavailable;
  const forbiddenOrigin = requireTrustedMutation(req);
  if (forbiddenOrigin) return forbiddenOrigin;

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

  // Utente OTP-only senza riga users: upsert via service role (ON CONFLICT DO
  // NOTHING) prima dell'insert — votes.juror_id ha FK su users, senza riga il
  // voto fallirebbe e il credito andrebbe perso. Self-vote resta bloccato
  // applicativamente e ora anche dal trigger DB votes_no_self_vote.
  const admin = createAdminClient();
  await admin.from("users").upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: true });

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

  // Moderazione della nota (se presente). Il contratto reale di moderateNote
  // è ok | filtered (fail-closed): nessun branch "flagged" irraggiungibile.
  let noteStatus: "ok" | "filtered" = "ok";
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

  // Credito e punteggio via RPC atomiche (§6.4: jury_credit += 1, juror_score += 1).
  // Sostituisce il read-then-write precedente (race: credito perso o doppio).
  const { error: awardErr } = await admin.rpc("award_jury_credit", {
    p_user_id: userId,
    p_amount: 1,
  });
  const { error: scoreErr } = await admin.rpc("bump_juror_score", { p_user_id: userId });

  // Il voto è già registrato: un errore dell'award non deve far fallire la risposta.
  const { data: freshUser } = await admin
    .from("users")
    .select("jury_credit")
    .eq("id", userId)
    .single();
  if (awardErr || scoreErr || !freshUser) {
    console.error("[vote] reward non accreditato", { userId, requestId, awardErr, scoreErr });
  }

  return NextResponse.json({ credit: freshUser?.jury_credit ?? 0, noteStatus });
}
