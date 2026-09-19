import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MAX_PER_SESSION = 20; // §6.4: max 20 carte per sessione di voto

/**
 * GET /api/queue/next — prossima request in jury_open da votare (§6.4):
 * esclude le proprie e quelle già votate; deadline più vicina prima;
 * richieste con meno voti prima; Pro +1 posizione; max 20 per sessione.
 *
 * Il contatore di sessione è server-side (cookie), non localStorage.
 */
export async function GET() {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Serve un account per votare." }, { status: 401 });
  }

  // Contatore di sessione lato server (cookie httpOnly, scade con la sessione).
  const sessionKey = "vb_vote_session";
  const cookies = await import("next/headers").then((m) => m.cookies());
  let votedThisSession = 0;
  try {
    votedThisSession = parseInt(cookies.get(sessionKey)?.value ?? "0", 10) || 0;
  } catch {
    votedThisSession = 0;
  }
  if (votedThisSession >= MAX_PER_SESSION) {
    return NextResponse.json(
      { done: true, message: "Hai votato abbastanza per adesso. Torna più tardi." },
      { status: 200 }
    );
  }

  // Richieste in jury_open, escluse le proprie, deadline più vicina prima.
  const { data: candidates, error } = await supabase
    .from("requests")
    .select("id, occasion_id, custom_occasion, jury_deadline_at, votes_target, photo_path")
    .eq("status", "jury_open")
    .neq("user_id", userId)
    .order("jury_deadline_at", { ascending: true })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ card: null, message: "Nessuno sta chiedendo in questo momento" });
  }

  // Escludi quelle già votate (in una query sola).
  const { data: voted, error: vErr } = await supabase
    .from("votes")
    .select("request_id")
    .eq("juror_id", userId)
    .in(
      "request_id",
      candidates.map((c) => c.id)
    );
  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });
  const votedSet = new Set((voted ?? []).map((v) => v.request_id));

  const remaining = candidates.filter((c) => !votedSet.has(c.id));
  if (remaining.length === 0) {
    return NextResponse.json({ card: null, message: "Nessuno sta chiedendo in questo momento" });
  }

  // Peso §6.4: richieste con meno voti prima; Pro +1 posizione.
  const ids = remaining.map((r) => r.id);
  const { data: voteCounts, error: cErr } = await supabase
    .from("votes")
    .select("request_id")
    .in("request_id", ids);
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  const counts = new Map<string, number>();
  for (const v of voteCounts ?? []) {
    counts.set(v.request_id, (counts.get(v.request_id) ?? 0) + 1);
  }

  // Pro: priorità +1 (la coda serve prima le richieste degli utenti Pro).
  const proFirst = remaining.filter((r) => {
    // votes_target=10 marca le richieste Pro (vengono da /api/jury/open con plan pro)
    return r.votes_target > 5;
  });

  const weighted = [...proFirst, ...remaining.filter((r) => !proFirst.includes(r))].sort((a, b) => {
    const ca = counts.get(a.id) ?? 0;
    const cb = counts.get(b.id) ?? 0;
    if (ca !== cb) return ca - cb;
    return a.jury_deadline_at!.localeCompare(b.jury_deadline_at!);
  });

  const card = weighted[0];
  const { data: occasion } = await supabase
    .from("occasions")
    .select("label_it")
    .eq("id", card.occasion_id)
    .single();

  // Firma URL foto a breve scadenza (1 min): alla cieca, niente metadati utente.
  const { data: signed } = await supabase.storage
    .from("outfits")
    .createSignedUrl(card.photo_path, 60);

  // Incrementa il contatore di sessione server-side.
  cookies.set(sessionKey, String(votedThisSession + 1), { httpOnly: true, sameSite: "lax", path: "/" });

  return NextResponse.json({
    card: {
      id: card.id,
      occasion: occasion?.label_it ?? card.custom_occasion ?? "",
      photoUrl: signed?.signedUrl ?? null,
      votesSoFar: counts.get(card.id) ?? 0,
      deadline: card.jury_deadline_at,
    },
    session: { voted: votedThisSession, max: MAX_PER_SESSION },
  });
}
