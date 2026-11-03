import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { JuryOpenRequest } from "@/lib/contracts";

export const runtime = "nodejs";

const JURY_DURATION_SECONDS = Number(process.env.JURY_DURATION_SECONDS ?? 180) || 180; // 3 min di default
const JURY_COST = 5;

/**
 * POST /api/jury/open — Fase 3.
 * Contratto credito:
 * - jury_credit >= 5 → spend_jury_credit (RPC atomica) e apre il giurì.
 * - jury_credit < 5 e allowAi=true → apre il giurì SENZA spendere: i voti
 *   mancanti saranno fill AI alla chiusura, dichiarati (is_ai=true, spec §3).
 * - jury_credit < 5 e allowAi assente/falso → 402 { error, allowAnyway: true }.
 * Concorrenza (P2): claim atomico dello stato ai_done → jury_open PRIMA della
 * spend — il secondo POST concorrente matcha 0 righe → 409 "Giurì già aperto",
 * mai una doppia spesa. Su errore dopo il claim, revert a ai_done.
 */
export async function POST(req: NextRequest) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {}; // body vuoto ammesso: allowAi assente
  }
  const parsed = JuryOpenRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Richiesta non valida." }, { status: 400 });
  }
  const { allowAi } = parsed.data;

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

  const insufficient = () =>
    NextResponse.json(
      {
        error: "Credito insufficiente.",
        credit: user.jury_credit,
        allowAnyway: true, // il voto mancante arriverà come parere automatico dichiarato
      },
      { status: 402 }
    );

  // Claim condizionale dello stato PRIMA della spend (P2): due POST concorrenti
  // — il secondo matcha 0 righe (status già jury_open) → 409, mai 200 doppio né
  // doppia spesa di 5 crediti. Lo flip è atomico: update con select per contare
  // le righe (nessuna RPC necessaria, RLS update-own protegge).
  const claim = await supabase
    .from("requests")
    .update({ status: "jury_open", jury_deadline_at: deadline, votes_target: 5 })
    .eq("id", request.id)
    .eq("status", "ai_done") // guardia: mai riaprire una request già in altro stato
    .select("id");
  if (claim.error) {
    return NextResponse.json({ error: "Giurì non aperto. Riprova." }, { status: 500 });
  }
  const claimedRows = claim.data as { id: string }[] | null;
  if (!claimedRows || claimedRows.length === 0) {
    // Un altro POST ha già aperto la giurì: non si rispende, 409 esplicito.
    return NextResponse.json(
      { error: "Giurì già aperto.", requestId: request.id },
      { status: 409 }
    );
  }

  // Su errore dopo il claim, la request torna ai_done: il prossimo POST riprova
  // da capo (nessuna giurì aperta a metà).
  const revertClaim = async () => {
    await supabase
      .from("requests")
      .update({ status: "ai_done" })
      .eq("id", request.id)
      .eq("status", "jury_open");
  };

  if (user.jury_credit >= JURY_COST) {
    // Scala 5 crediti con RPC atomica: il WHERE jury_credit >= p_cost evita
    // il credito negativo anche sotto concorrenza (nessun read-then-write).
    const admin = createAdminClient();
    const { data: spent, error: spendErr } = await admin.rpc("spend_jury_credit", {
      p_user_id: userId,
      p_cost: JURY_COST,
    });
    if (spendErr) {
      await revertClaim();
      return NextResponse.json({ error: "Credito non aggiornato." }, { status: 500 });
    }
    if (!spent) {
      // Race persa (credito intanto sceso sotto il costo): con allowAi si apre
      // comunque il giurì (P3/P0-1: il 402 dopo il claim bloccava il client);
      // senza allowAi, revert e 402 col solito contratto.
      if (!allowAi) {
        await revertClaim();
        return insufficient();
      }
    }
  } else if (!allowAi) {
    await revertClaim();
    return insufficient();
  }
  // qui: spend riuscita, oppure allowAi=true (senza credito o con race persa):
  // il giurì resta aperto e i voti mancanti saranno fill AI alla chiusura,
  // dichiarato (is_ai=true, spec §3). Invariante: is_ai=true solo sui fill (cron).

  return NextResponse.json({
    requestId: request.id,
    deadline,
    durationSeconds: JURY_DURATION_SECONDS,
  });
}
