import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { stripe, PRICE_IDS } from "@/lib/stripe";

export const runtime = "nodejs";

const CheckoutBody = z.object({
  product: z.enum(["boost", "pro_monthly", "pro_yearly"]),
});

/**
 * POST /api/stripe/checkout — crea la sessione Checkout.
 * Boost €0,99 (una tantum) · Pro €3,99/mese · Pro €29/anno.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Serve un account." }, { status: 401 });
  }

  const body = CheckoutBody.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Prodotto non valido." }, { status: 400 });
  }

  const priceId =
    body.data.product === "boost"
      ? PRICE_IDS.boost
      : body.data.product === "pro_monthly"
        ? PRICE_IDS.proMonthly
        : PRICE_IDS.proYearly;
  if (!priceId) {
    return NextResponse.json({ error: "Pagamenti non configurati." }, { status: 503 });
  }

  const { data: user } = await supabase
    .from("users")
    .select("email")
    .eq("id", userId)
    .single();

  const session = await stripe().checkout.sessions.create({
    mode: body.data.product === "boost" ? "payment" : "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    // Metadati usati dal webhook per applicare gli effetti.
    client_reference_id: userId,
    metadata: { userId, product: body.data.product },
    subscription_data: body.data.product === "boost" ? undefined : { metadata: { userId } },
    customer_email: user?.email ?? undefined,
    success_url: `${req.nextUrl.origin}/me`,
    cancel_url: `${req.nextUrl.origin}/me`,
  });

  return NextResponse.json({ url: session.url });
}
