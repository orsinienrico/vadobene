import { betaModeRequested, requireBetaInvite } from "@/lib/beta-access";
import { requireLiveInteractions } from "@/lib/launch-control";
import { requireTrustedMutation } from "@/lib/request-security";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getAiVerdict } from "@/lib/anthropic";
import { AiVerdict, VerdictRequest } from "@/lib/contracts";
import { normalizeOutfitPhoto } from "@/lib/photo-processing";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/verdict — Fase 1.
 * { photo: base64, occasionSlug } → primo parere AI + requests.status='ai_done'.
 * unsafe_content → 422, foto non salvata, messaggio in voce brand.
 */
export async function POST(req: NextRequest) {
  const unavailable = requireLiveInteractions();
  if (unavailable) return unavailable;
  const denied = await requireBetaInvite();
  if (denied) return denied;
  const forbiddenOrigin = requireTrustedMutation(req);
  if (forbiddenOrigin) return forbiddenOrigin;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Richiesta non valida." }, { status: 400 });
  }

  const parsed = VerdictRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Richiesta non valida." }, { status: 400 });
  }
  const { photo, occasionSlug } = parsed.data;

  const supabase = await createClient();
  const admin = createAdminClient();

  // Occasione deve esistere (niente occasioni libere nell'MVP).
  const { data: occasion, error: occErr } = await supabase
    .from("occasions")
    .select("id, label_it")
    .eq("slug", occasionSlug)
    .single();
  if (occErr || !occasion) {
    return NextResponse.json({ error: "Occasione non trovata." }, { status: 400 });
  }

  // Sessione anonima se l'utente non è loggato: può chiedere il primo parere.
  const { data: userData } = await supabase.auth.getUser();
  let userId = userData?.user?.id;
  if (!userId) {
    const { data: anon, error: anonErr } = await supabase.auth.signInAnonymously();
    if (anonErr || !anon.user) {
      return NextResponse.json({ error: "Sessione non disponibile." }, { status: 500 });
    }
    userId = anon.user.id;
    // La riga users viene creata SOLO dal server, dopo la verifica auth.
  }

  // I client anon/authenticated non possono creare profili con crediti o
  // piano Pro arbitrari. Upsert solo service_role e soltanto sul campo id.
  const { error: profileError } = await admin.from("users").upsert(
    { id: userId }, { onConflict: "id", ignoreDuplicates: true }
  );
  if (profileError) {
    return NextResponse.json({ error: "Profilo non disponibile." }, { status: 500 });
  }

  // Resize server-side se > 1280px (doppia garanzia al resize client).
  let photoBuffer: Buffer;
  try {
    // Re-encode and strip GPS/EXIF on both Node and Cloudflare Workers.
    // Raw uploads are never persisted or sent to the AI provider.
    photoBuffer = await normalizeOutfitPhoto(photo);
  } catch {
    return NextResponse.json({ error: "Non riesco a leggere la foto." }, { status: 400 });
  }

  // Server-side, atomic per-user cap before any paid Anthropic request.
  // The quota is only active in invited beta, with no fallback to a local
  // Worker counter (which would be unreliable across isolates).
  if (betaModeRequested()) {
    const { data: permitted, error: quotaError } = await admin.rpc("consume_beta_ai_daily_quota", {
      p_user_id: userId,
      p_daily_limit: 3,
    });
    if (quotaError || typeof permitted !== "boolean") {
      console.error("[verdict] beta AI quota unavailable", { code: quotaError?.code });
      return NextResponse.json(
        { error: "Il limite dei pareri non è disponibile. Riprova." },
        { status: 503 }
      );
    }
    if (!permitted) {
      return NextResponse.json(
        { error: "Hai esaurito i 3 pareri AI disponibili oggi nella beta." },
        { status: 429, headers: { "Cache-Control": "no-store" } }
      );
    }
  }

  // Primo parere AI.
  let verdict;
  try {
    const rawVerdict = await getAiVerdict(photoBuffer.toString("base64"), occasion.label_it);
    verdict = AiVerdict.parse(rawVerdict);
  } catch {
    return NextResponse.json(
      { error: "Il primo parere non è arrivato. Riprova." },
      { status: 502 }
    );
  }

  // Contenuto non sicuro: niente salvataggio, 422 in voce brand.
  if (verdict.unsafe_content) {
    return NextResponse.json(
      { error: "Non vedo un outfit. Riprova con una foto a figura intera." },
      { status: 422 }
    );
  }

  // Per impedire upload diretti via chiave anonima, solo il server può
  // scrivere nel bucket privato e nella tabella requests.
  // Salva la foto in bucket privato: {user_id}/{request_id}.jpg
  const requestId = crypto.randomUUID();
  const photoPath = `${userId}/${requestId}.jpg`;
  const { error: upErr } = await admin.storage
    .from("outfits")
    .upload(photoPath, photoBuffer, { contentType: "image/jpeg", upsert: false });
  if (upErr) {
    return NextResponse.json({ error: "Foto non salvata. Riprova." }, { status: 500 });
  }

  const { data: request, error: reqErr } = await admin
    .from("requests")
    .insert({
      id: requestId,
      user_id: userId,
      occasion_id: occasion.id,
      photo_path: photoPath,
      status: "ai_done",
      ai_verdict: verdict,
    })
    .select("id")
    .single();

  if (reqErr) {
    // Never leak orphaned photos if the database insert fails.
    const { error: cleanupError } = await admin.storage.from("outfits").remove([photoPath]);
    if (cleanupError) console.error("[verdict] orphan-photo cleanup failed", { requestId });
    return NextResponse.json({ error: "Richiesta non salvata. Riprova." }, { status: 500 });
  }

  return NextResponse.json({ requestId, verdict });
}
