import { NextRequest, NextResponse } from "next/server";

export function trustedSiteOrigin(
  env: Readonly<Record<string, string | undefined>> = process.env
): string | null {
  const raw = env.NEXT_PUBLIC_SITE_URL;
  if (!raw) return env.NODE_ENV === "development" ? "http://localhost:3000" : null;
  try {
    const parsed = new URL(raw);
    if (
      parsed.protocol !== "https:" &&
      !(env.NODE_ENV === "development" && parsed.origin === "http://localhost:3000")
    ) return null;
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

/** CSRF origin verification. Stripe webhooks and cron routes use separate auth. */
export function isTrustedMutationOrigin(
  headers: Pick<Headers, "get">,
  env: Readonly<Record<string, string | undefined>> = process.env
): boolean {
  const origin = headers.get("origin");
  const fetchSite = headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return false;
  if (!origin) return fetchSite === null || fetchSite === "none" || fetchSite === "same-origin";
  const trusted = trustedSiteOrigin(env);
  return trusted !== null && origin === trusted;
}

export function requireTrustedMutation(req: NextRequest | Request): NextResponse | null {
  if (isTrustedMutationOrigin(req.headers)) return null;
  return NextResponse.json({ error: "Origine richiesta non autorizzata." }, { status: 403 });
}
