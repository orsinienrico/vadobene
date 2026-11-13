import { requireTrustedMutation } from "@/lib/request-security";
import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/me/delete-all — "Cancella tutto" (Fase 4): hard delete.
 * Elimina utente, richieste, voti, foto. Zero righe residue.
 */
export async function POST(req: Request) {
  const forbiddenOrigin = requireTrustedMutation(req);
  if (forbiddenOrigin) return forbiddenOrigin;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Cancellazione temporaneamente non disponibile." }, { status: 503 });
  }
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Non sei dentro." }, { status: 401 });
  }

  const admin = createAdminClient();

  // Foto dal bucket prima di cancellare le requests (il path serve ancora).
  const { data: requests, error: listError } = await admin
    .from("requests")
    .select("photo_path")
    .eq("user_id", userId)
    .not("photo_path", "is", null);

  if (listError) {
    return NextResponse.json({ error: "Impossibile verificare le fotografie." }, { status: 500 });
  }
  if (requests && requests.length > 0) {
    const { error: storageError } = await admin.storage.from("outfits").remove(requests.map((r) => r.photo_path!));
    if (storageError) {
      return NextResponse.json({ error: "Cancellazione fotografie non riuscita." }, { status: 500 });
    }
  }

  // ON DELETE CASCADE su requests/votes/reports/users: basta l'utente.
  // users.id → auth.users(id) con on delete cascade, quindi l'eliminazione
  // dell'utente auth rimuove la riga users e a cascata richieste e voti.
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    return NextResponse.json({ error: "Cancellazione non riuscita." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
