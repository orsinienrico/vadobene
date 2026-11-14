import { NextResponse } from "next/server";
import { betaModeRequested } from "@/lib/beta-access";
import { releaseReadiness } from "@/lib/release-readiness";

/**
 * Release gates remain OFF by default. The beta does NOT require live Stripe,
 * but it DOES require an independently verified scheduler, image processing,
 * auth SMTP, moderation and private photo retention before accepting photos.
 */
export function betaInteractionsEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env
): boolean {
  if (!betaModeRequested(env) || env.BETA_READY_CONFIRMED !== "true") return false;
  const { services } = releaseReadiness(env);
  return services.database && services.ai && services.scheduler &&
    services.email && services.siteUrl &&
    Boolean(env.BETA_ALLOWED_EMAILS?.trim());
}

export function commercialInteractionsEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env
): boolean {
  if (!env.VERCEL_ENV && (env.NODE_ENV === "development" || env.NODE_ENV === "test")) return true;
  return env.LAUNCH_ENABLED === "true" && releaseReadiness(env).configured;
}

export function liveInteractionsEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env
): boolean {
  if (!env.VERCEL_ENV && (env.NODE_ENV === "development" || env.NODE_ENV === "test")) return true;
  return commercialInteractionsEnabled(env) || betaInteractionsEnabled(env);
}

export function requireLiveInteractions(): NextResponse | null {
  if (liveInteractionsEnabled()) return null;
  return NextResponse.json(
    { error: "Il servizio non è ancora attivo." },
    { status: 503, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } }
  );
}

/** Stripe must never become live solely because the free beta is enabled. */
export function requireCommercialInteractions(): NextResponse | null {
  if (commercialInteractionsEnabled()) return null;
  return NextResponse.json(
    { error: "I pagamenti non sono attivi durante la beta." },
    { status: 503, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } }
  );
}
