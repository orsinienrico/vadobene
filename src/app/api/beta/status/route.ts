import { NextResponse } from "next/server";
import { betaModeRequested, requireBetaInvite } from "@/lib/beta-access";
import { betaAuthEnabled } from "@/lib/launch-control";

export const dynamic = "force-dynamic";

/** Only for invited beta members; never returns the allowlist or personal data. */
export async function GET() {
  if (!betaModeRequested()) {
    return NextResponse.json({ error: "Beta non attiva." }, { status: 404 });
  }
  if (!betaAuthEnabled()) {
    return NextResponse.json({ error: "Login non attivo." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const denied = await requireBetaInvite();
  if (denied) return denied;
  return NextResponse.json({ invited: true }, { headers: { "Cache-Control": "no-store" } });
}
