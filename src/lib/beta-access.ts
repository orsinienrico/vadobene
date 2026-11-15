import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * A deliberately small pilot allowlist. Stored as a Cloudflare Worker Secret,
 * never in NEXT_PUBLIC_* variables or in the source repository.
 *
 * Account signup must also be disabled in Supabase Auth during the pilot.
 * Operators create/invite users in Supabase Auth > Users.
 */
export function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isBetaEmailInvited(
  email: string | undefined | null,
  allowlist: string | undefined
): boolean {
  if (!email || !allowlist) return false;
  const normalized = normalizedEmail(email);
  if (!normalized || !normalized.includes("@")) return false;
  return allowlist.split(",").some((entry) => normalizedEmail(entry) === normalized);
}

export function betaModeRequested(
  env: Readonly<Record<string, string | undefined>> = process.env
): boolean {
  return env.BETA_ENABLED === "true" && env.LAUNCH_ENABLED !== "true";
}

/**
 * Enforce beta membership inside each server API before any privileged DB read,
 * private photo access, or Anthropic/Stripe cost. Browser checks are only UX.
 * The email comes from Supabase Auth getUser(), never a request body or JWT
 * user_metadata. No anonymous user can enter the beta.
 */
export async function requireBetaInvite(): Promise<NextResponse | null> {
  if (!betaModeRequested()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user || data.user.is_anonymous === true || !data.user.email || !data.user.email_confirmed_at) {
    return NextResponse.json(
      { error: "Accedi con l'email invitata per usare la beta.", loginUrl: "/login" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }
  if (!isBetaEmailInvited(data.user.email, process.env.BETA_ALLOWED_EMAILS)) {
    return NextResponse.json(
      { error: "Questo account non è nella beta privata." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }
  return null;
}
