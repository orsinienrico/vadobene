import { liveInteractionsEnabled } from "@/lib/launch-control";
import { NextResponse } from "next/server";
import { releaseReadiness } from "@/lib/release-readiness";

export const dynamic = "force-dynamic";

/**
 * Configuration-only launch gate. Unlike /api/health, reports 503 until all
 * required external services and a verified scheduler are configured.
 * Does not validate live credentials, DB migrations or actual delivery.
 */
export async function GET() {
  const { configured: dependenciesConfigured } = releaseReadiness(process.env);
  const configured = dependenciesConfigured && liveInteractionsEnabled(process.env);
  return NextResponse.json(
    { configured },
    {
      status: configured ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    }
  );
}
