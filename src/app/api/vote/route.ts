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
 * accredita il voto e il credito con una sola transazione DB, restituisce { credit }.
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

  // La RPC gestisce la creazione del profilo, l'inserimento del voto,
  // il controllo di deadline/stato e il credito in UN'UNICA transazione.
  const admin = createAdminClient();

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

  // L'RPC blocca la riga requests FOR UPDATE, quindi la chiusura
  // concorrente del giurì non può contabilizzare voti dopo la deadline.
  // Nessun credito senza voto e nessun voto senza credito (rollback).
  const { data: credit, error: voteErr } = await admin.rpc("record_jury_vote", {
    p_request_id: requestId,
    p_juror_id: userId,
    p_verdict: verdict,
    p_note: noteStatus === "ok" ? note ?? null : null,
    p_note_status: noteStatus,
  });

  if (voteErr) {
    if (voteErr.code === "23505") {
      return NextResponse.json({ error: "Hai già votato questa richiesta." }, { status: 409 });
    }
    if (voteErr.code === "42501") {
      return NextResponse.json({ error: "Non puoi votare la tua richiesta." }, { status: 403 });
    }
    if (voteErr.code === "P0002") {
      return NextResponse.json({ error: "Richiesta non trovata." }, { status: 404 });
    }
    if (voteErr.code === "P0001") {
      return NextResponse.json({ error: "Il giurì non accetta più voti." }, { status: 409 });
    }
    console.error("[vote] transazione non riuscita", { requestId, code: voteErr.code });
    return NextResponse.json({ error: "Voto non registrato. Riprova." }, { status: 500 });
  }
  if (typeof credit !== "number") {
    return NextResponse.json({ error: "Voto non confermato." }, { status: 500 });
  }
  return NextResponse.json({ credit, noteStatus });
}
