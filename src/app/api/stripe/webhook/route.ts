import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/server";
import { trackServer } from "@/lib/analytics";

export const runtime = "nodejs";

/**
 * Webhook Stripe — Fase 4. Verifica firma, idempotente.
 * - checkout.session.completed con product=boost → +5 credito
 * - con product=pro_* → plan='pro'
 * - customer.subscription.deleted → plan='free'
 * L'effetto viene applicato DOPO l'insert nel ledger processed_events: se
 * l'effetto fallisce, la riga del ledger viene rimossa e si risponde 500 così
 * Stripe ritrasmette l'evento (P1: mai marcare processed prima dell'effetto).
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

  // Controlla se l'evento è già stato processato (idempotenza).
  const { data: existing } = await admin
    .from("processed_events")
    .select("id")
    .eq("id", event.id)
    .single();
  if (existing) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // L'effetto fallisce: fail-closed, rispondi 500 (Stripe ritrasmette).
  // NON inserire il ledger se l'effetto non è applicato.
  const failWithoutLedger = (reason: string, err: unknown, userId: string) => {
    console.error("[stripe-webhook] effetto non applicato, ledger non inserito", {
      eventId: event.id,
      userId,
      reason,
      err,
    });
    return NextResponse.json({ error: "Evento non processato. Riprova." }, { status: 500 });
  };

  let processedOk = false;
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.metadata?.userId ?? session.client_reference_id;
      const product = session.metadata?.product;
      if (!userId) break;

      if (product === "boost") {
        // Boost: +5 credito via RPC atomica (no read-then-write) e si riapre
        // il flusso lato UI.
        const { error: awardErr } = await admin.rpc("award_jury_credit", {
          p_user_id: userId,
          p_amount: 5,
        });
        if (awardErr) {
          return failWithoutLedger("boost non accreditato", awardErr, userId);
        }
        void trackServer("boost_purchased", userId);
        processedOk = true;
      } else if (product === "pro_monthly" || product === "pro_yearly") {
        const { error: planErr } = await admin.from("users").update({ plan: "pro" }).eq("id", userId);
        if (planErr) {
          return failWithoutLedger("plan pro non aggiornato", planErr, userId);
        }
        void trackServer("pro_subscribed", userId, {
          cycle: product === "pro_monthly" ? "monthly" : "yearly",
        });
        processedOk = true;
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const userId = sub.metadata?.userId;
      if (userId) {
        const { error: planErr } = await admin.from("users").update({ plan: "free" }).eq("id", userId);
        if (planErr) {
          return failWithoutLedger("plan free non aggiornato", planErr, userId);
        }
        processedOk = true;
      }
      break;
    }
  }

  // Insert nel ledger SOLO se l'effetto è stato applicato.
  if (processedOk) {
    const { error: ledgerErr } = await admin.from("processed_events").insert({ id: event.id });
    if (ledgerErr && ledgerErr.code !== "23505") {
      // Ledger non raggiungibile (non è duplicate): fail-closed per retry.
      console.error("[stripe-webhook] ledger insert fallito", {
        eventId: event.id,
        err: ledgerErr,
      });
      return NextResponse.json({ error: "Ledger non disponibile." }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
