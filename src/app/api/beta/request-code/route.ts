import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isBetaEmailInvited } from "@/lib/beta-access";
import { betaAuthEnabled } from "@/lib/launch-control";
import { requireTrustedMutation } from "@/lib/request-security";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const RequestCodeBody = z.object({
  email: z.string().trim().email().max(254),
});

const noStore = { "Cache-Control": "no-store" };

/**
 * Only invited, existing Supabase Auth users can request an OTP via this
 * product endpoint. Do not leak whether an email is on the allowlist.
 *
 * IMPORTANT: Cloudflare/Supabase rate limits and Supabase Auth signup disabled
 * are separate operational requirements, not substitutes for this check.
 */
export async function POST(req: NextRequest) {
  if (!betaAuthEnabled(process.env)) {
    return NextResponse.json(
      { error: "La beta non è ancora attiva." },
      { status: 503, headers: noStore }
    );
  }
  const originError = requireTrustedMutation(req);
  if (originError) return originError;

  const parsed = RequestCodeBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Indirizzo email non valido." },
      { status: 400, headers: noStore }
    );
  }

  const email = parsed.data.email.toLowerCase();
  const reply = () => NextResponse.json(
    { ok: true, message: "Se l'indirizzo è invitato, riceverai un codice." },
    { headers: noStore }
  );

  if (!isBetaEmailInvited(email, process.env.BETA_ALLOWED_EMAILS)) return reply();

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  if (error) {
    // Do not expose user existence or email provider status in the response.
    console.error("[beta-request-code] Supabase Auth rejected OTP request", {
      code: error.code ?? "unknown",
    });
  }
  return reply();
}
