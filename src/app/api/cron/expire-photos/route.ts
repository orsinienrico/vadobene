import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { computeCutoff } from "@/lib/retention";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Cron periodico — Fase 4. Protetta da CRON_SECRET.
 * Cancella dallo Storage le foto delle requests con created_at < now()-24h
 * e keep_photo=false, poi status='expired'.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  // Fail closed: mai esporre un cron che usa service_role se manca il secret.
  if (!secret) {
    return NextResponse.json({ error: "Cron non configurato." }, { status: 503 });
  }
  if (req.headers.get("authorization") !== "Bearer " + secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const cutoff = computeCutoff(Date.now());

  const { data: expired, error } = await supabase
    .from("requests")
    .select("id, photo_path")
    .lt("created_at", cutoff)
    .eq("keep_photo", false)
    .neq("status", "expired")
    .not("photo_path", "is", null)
    // Always process oldest photos first; bounded work avoids storage API limits
    // and timeouts under load. Monitor backlogPossible from the scheduler.
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!expired || expired.length === 0) {
    return NextResponse.json({ expired: 0 });
  }

  // Cancellazione effettiva dallo Storage.
  const paths = expired.map((r) => r.photo_path!);
  const { error: rmErr } = await supabase.storage.from("outfits").remove(paths);
  if (rmErr) {
    return NextResponse.json({ error: `Storage: ${rmErr.message}` }, { status: 500 });
  }

  // Marca come expired.
  const ids = expired.map((r) => r.id);
  const { error: updErr } = await supabase
    .from("requests")
    .update({ status: "expired", photo_path: null })
    .in("id", ids);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ expired: ids.length, backlogPossible: ids.length === 100 });
}
