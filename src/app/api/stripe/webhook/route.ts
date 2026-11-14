import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/server";
import { trackServer } from "@/lib/analytics";

export const runtime = "nodejs";

/**
 * Stripe webhook: verifica firma e delega ogni effetto economico alla RPC
 * transazionale process_stripe_event. Richiede migration 0004.
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

  // Il ledger e l'effetto economico devono essere nella STESSA transazione.
  // Un controllo SELECT prima del credito e un INSERT dopo non sono idempotenti
  // quando Stripe consegna due webhook simultaneamente.
  let userId: string | undefined;
  let action: "boost" | "pro" | "free" | undefined;

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object;
    // Checkout may complete before an asynchronous payment has settled.
    // Never grant paid credits or subscriptions while payment is pending.
    if (session.payment_status !== "paid") {
      return NextResponse.json({ received: true, paymentPending: true });
    }
    userId = session.metadata?.userId ?? session.client_reference_id ?? undefined;
    if (session.metadata?.product === "boost") action = "boost";
    if (session.metadata?.product === "pro_monthly" || session.metadata?.product === "pro_yearly") {
      action = "pro";
    }
  } else if (event.type === "customer.subscription.deleted") {
    userId = event.data.object.metadata?.userId;
    action = "free";
  }

  // Eventi non gestiti o senza un utente identificabile non causano modifiche.
  if (!userId || !action) return NextResponse.json({ received: true });

  const admin = createAdminClient();
  // La RPC process_stripe_event (migration 0004) inserisce processed_events e
  // accredita/aggiorna users in una singola transazione Postgres.
  // False = duplicato già applicato; l'errore transazionale fa rollback.
  const { data: applied, error } = await admin.rpc("process_stripe_event", {
    p_event_id: event.id,
    p_user_id: userId,
    p_action: action,
  });
  if (error || typeof applied !== "boolean") {
    console.error("[stripe-webhook] transazione non completata", {
      eventId: event.id,
      action,
      error,
    });
    return NextResponse.json({ error: "Evento non processato. Riprova." }, { status: 500 });
  }
  if (!applied) return NextResponse.json({ received: true, duplicate: true });

  if (action === "boost") void trackServer("boost_purchased", userId);
  if (action === "pro") {
    const session = event.data.object as Stripe.Checkout.Session;
    void trackServer("pro_subscribed", userId, {
      cycle: session.metadata?.product === "pro_monthly" ? "monthly" : "yearly",
    });
  }

  return NextResponse.json({ received: true });
}
