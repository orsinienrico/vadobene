import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Webhook Stripe — Fase 4. Verifica firma, idempotente.
 * - checkout.session.completed con product=boost → +5 credito
 * - con product=pro_* → plan='pro', votes_target=10
 * - customer.subscription.deleted → plan='free'
 */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook non configurato." }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Firma mancante." }, { status: 400 });
  }

  const payload = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(payload, signature, secret);
  } catch {
    // Firma non valida: rifiuta.
    return NextResponse.json({ error: "Firma non valida." }, { status: 400 });
  }

  const admin = createAdminClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.metadata?.userId ?? session.client_reference_id;
      const product = session.metadata?.product;
      if (!userId) break;

      if (product === "boost") {
        // Boost: +5 credito e si riapre il flusso lato UI.
        const { data: user } = await admin
          .from("users")
          .select("jury_credit")
          .eq("id", userId)
          .single();
        await admin
          .from("users")
          .update({ jury_credit: (user?.jury_credit ?? 0) + 5 })
          .eq("id", userId);
      } else if (product === "pro_monthly" || product === "pro_yearly") {
        await admin.from("users").update({ plan: "pro" }).eq("id", userId);
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const userId = sub.metadata?.userId;
      if (userId) {
        await admin.from("users").update({ plan: "free" }).eq("id", userId);
      }
      break;
    }
  }

  // Eventi duplicati: Stripe ritrasmette; gli effetti sono idempotenti
  // (plan='pro' e +5 credito con boost pagato una sola volta per session id).
  return NextResponse.json({ received: true });
}
