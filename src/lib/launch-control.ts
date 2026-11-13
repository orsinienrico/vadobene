import { NextResponse } from "next/server";
import { releaseReadiness } from "@/lib/release-readiness";

/**
 * Explicit kill switch. Never assume that a deploy is publicly usable simply
 * because environment variables exist. Local `next dev` remains mockable.
 */
export function liveInteractionsEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env
): boolean {
  if (!env.VERCEL_ENV && env.NODE_ENV === "development") return true;
  return env.LAUNCH_ENABLED === "true" && releaseReadiness(env).configured;
}

export function requireLiveInteractions(): NextResponse | null {
  if (liveInteractionsEnabled()) return null;
  return NextResponse.json(
    { error: "Il servizio non è ancora attivo." },
    { status: 503, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } }
  );
}
