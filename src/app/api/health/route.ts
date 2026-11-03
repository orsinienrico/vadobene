import { NextResponse } from "next/server";

/**
 * Healthcheck per Docker/compose e monitor esterno: statico e dependency-free.
 * Niente Supabase/AI qui — l'HEALTHCHECK non deve fallire per un blip esterno.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, ts: new Date().toISOString() });
}
