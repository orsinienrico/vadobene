import { requireBetaInvite } from "@/lib/beta-access";
import { requireLiveInteractions } from "@/lib/launch-control";
import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { MAX_PER_SESSION, rankCandidates } from "@/lib/queue-rank";

export const dynamic = "force-dynamic";

/**
 * GET /api/queue/next — prossima request in jury_open da votare (§6.4):
 * esclude le proprie e quelle già votate; deadline più vicina prima;
 * richieste con meno voti prima; Pro +1 posizione; max 20 per sessione.
 *
 * Il contatore di sessione è server-side (cookie), non localStorage.
 */
export async function GET() {
  const unavailable = requireLiveInteractions();
  if (unavailable) return unavailable;
  const denied = await requireBetaInvite();
  if (denied) return denied;

  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Serve un account per votare." }, { status: 401 });
  }

  // Credito corrente (per il gate di voto lato client): 0 se la riga è assente.
  const { data: profile, error: pErr } = await supabase
    .from("users")
    .select("jury_credit")
    .eq("id", userId)
    .single();
  if (pErr && pErr.code !== "PGRST116") {
    return NextResponse.json({ error: "Non riesco a caricare la coda. Riprova." }, { status: 500 });
  }
  const credit = profile?.jury_credit ?? 0;

  // Contatore di sessione lato server (cookie httpOnly, scade con la sessione).
  // Formato "<voted>:<lastCardId>" (retrocompatibile col vecchio "<voted>"):
  // il contatore cresce SOLO quando viene servita una card NUOVA — un refresh
  // o un "Ricontrolla" della stessa card non brucia la sessione (P3: 20 fetch
  // facevano scadere il limite senza votare).
  const sessionKey = "vb_vote_session";
  const cookies = await import("next/headers").then((m) => m.cookies());
  let votedThisSession = 0;
  let lastCardId: string | null = null;
  try {
    const raw = cookies.get(sessionKey)?.value ?? "";
    const [count, last] = raw.split(":");
    votedThisSession = parseInt(count ?? "0", 10) || 0;
    lastCardId = last || null;
  } catch {
    votedThisSession = 0;
  }
  if (votedThisSession >= MAX_PER_SESSION) {
    return NextResponse.json(
      { done: true, credit, message: "Hai votato abbastanza per adesso. Torna più tardi." },
      { status: 200 }
    );
  }

  const admin = createAdminClient();

  // Authorized server-side query: no open-jury request metadata in the client Data API.
  // Richieste in jury_open, escluse le proprie, deadline più vicina prima.
  const { data: candidates, error } = await admin
    .from("requests")
    .select("id, occasion_id, custom_occasion, jury_deadline_at, votes_target, photo_path")
    .eq("status", "jury_open")
    .neq("user_id", userId)
    .order("jury_deadline_at", { ascending: true })
    .limit(50);

  if (error) return NextResponse.json({ error: "Non riesco a caricare la coda. Riprova." }, { status: 500 });

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ card: null, credit, message: "Nessuno sta chiedendo in questo momento" });
  }

  // Escludi quelle già votate (in una query sola).
  const { data: voted, error: vErr } = await admin
    .from("votes")
    .select("request_id")
    .eq("juror_id", userId)
    .in(
      "request_id",
      candidates.map((c) => c.id)
    );
  if (vErr) return NextResponse.json({ error: "Non riesco a caricare la coda. Riprova." }, { status: 500 });
  const votedSet = new Set((voted ?? []).map((v) => v.request_id));

  const remaining = candidates.filter((c) => !votedSet.has(c.id));
  if (remaining.length === 0) {
    return NextResponse.json({ card: null, credit, message: "Nessuno sta chiedendo in questo momento" });
  }

  // Peso §6.4: richieste con meno voti prima; Pro +1 posizione.
  const ids = remaining.map((r) => r.id);
  const { data: voteCounts, error: cErr } = await admin
    .from("votes")
    .select("request_id")
    .in("request_id", ids);
  if (cErr) return NextResponse.json({ error: "Non riesco a caricare la coda. Riprova." }, { status: 500 });

  const counts = new Map<string, number>();
  for (const v of voteCounts ?? []) {
    counts.set(v.request_id, (counts.get(v.request_id) ?? 0) + 1);
  }

  // Peso §6.4: richieste con meno voti prima; Pro +1 posizione; tie-break
  // deadline. Logica estratta in src/lib/queue-rank.ts (comportamento invariato).
  const weighted = rankCandidates(remaining, counts);

  const card = weighted[0];
  const { data: occasion } = await supabase
    .from("occasions")
    .select("label_it")
    .eq("id", card.occasion_id)
    .single();

  // Firma URL foto a breve scadenza (1 min): alla cieca, niente metadati utente.
  // Il giurato non è proprietario del file: la sua chiave autenticata non ha
  // diritto SELECT sul bucket privato. Firma soltanto lato server, dopo i
  // controlli su request aperta e user/juror.
  const { data: signed, error: signError } = await admin.storage
    .from("outfits")
    .createSignedUrl(card.photo_path, 60);
  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ error: "Foto temporaneamente non disponibile." }, { status: 502 });
  }

  // Incrementa il contatore di sessione SOLO se la card servita è diversa dalla
  // precedente: ricontrollare/refreshare la stessa card non consuma sessione.
  const served = card.id !== lastCardId ? votedThisSession + 1 : votedThisSession;
  cookies.set(sessionKey, `${served}:${card.id}`, { httpOnly: true, sameSite: "lax", path: "/" });

  return NextResponse.json({
    card: {
      id: card.id,
      occasion: occasion?.label_it ?? card.custom_occasion ?? "",
      photoUrl: signed?.signedUrl ?? null,
      votesSoFar: counts.get(card.id) ?? 0,
      deadline: card.jury_deadline_at,
    },
    session: { voted: served, max: MAX_PER_SESSION },
    credit,
  });
}
