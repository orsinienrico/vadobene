import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * POST /api/stripe/portal — Customer Portal per gestire l'abbonamento Pro.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Serve un account." }, { status: 401 });
  }

  // Trova il customer Stripe: lo cerchiamo per email (semplificazione MVP).
  const { data: user } = await supabase
    .from("users")
    .select("email")
    .eq("id", userId)
    .single();
  if (!user?.email) {
    return NextResponse.json({ error: "Nessun abbonamento." }, { status: 404 });
  }

  const customers = await stripe().customers.list({ email: user.email, limit: 1 });
  const customer = customers.data[0];
  if (!customer) {
    return NextResponse.json({ error: "Nessun abbonamento." }, { status: 404 });
  }

  const origin = req.headers.get("origin") ?? "http://localhost:3000";
  const portal = await stripe().billingPortal.sessions.create({
    customer: customer.id,
    return_url: `${origin}/me`,
  });

  return NextResponse.json({ url: portal.url });
}
