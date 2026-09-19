import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/me/delete-all — "Cancella tutto" (Fase 4): hard delete.
 * Elimina utente, richieste, voti, foto. Zero righe residue.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Non sei dentro." }, { status: 401 });
  }

  const admin = createAdminClient();

  // Foto dal bucket prima di cancellare le requests (il path serve ancora).
  const { data: requests } = await admin
    .from("requests")
    .select("photo_path")
    .eq("user_id", userId)
    .not("photo_path", "is", null);

  if (requests && requests.length > 0) {
    await admin.storage.from("outfits").remove(requests.map((r) => r.photo_path!));
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
