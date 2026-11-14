import { trustedSiteOrigin } from "@/lib/request-security";
import { requireLiveInteractions } from "@/lib/launch-control";
import { requireTrustedMutation } from "@/lib/request-security";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * POST /api/stripe/portal — Customer Portal per gestire l'abbonamento Pro.
 */
export async function POST(req: Request) {
  const unavailable = requireLiveInteractions();
  if (unavailable) return unavailable;
  const forbiddenOrigin = requireTrustedMutation(req);
  if (forbiddenOrigin) return forbiddenOrigin;

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Serve un account." }, { status: 401 });
  }

  // Never authorize a Billing Portal session by email matching:
  // email is not a stable identity and could expose another customer's billing.
  const customers = await stripe().customers.search({
    query: `metadata['userId']:'${userId}'`,
    limit: 1,
  });
  const customer = customers.data.find((c) => !c.deleted && c.metadata?.userId === userId);
  if (!customer) {
    return NextResponse.json({ error: "Nessun abbonamento." }, { status: 404 });
  }

  const origin = trustedSiteOrigin();
  if (!origin) return NextResponse.json({ error: "Dominio non configurato." }, { status: 503 });
  const portal = await stripe().billingPortal.sessions.create({
    customer: customer.id,
    return_url: `${origin}/me`,
  });

  return NextResponse.json({ url: portal.url });
}
