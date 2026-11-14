import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { POST } from "@/app/api/stripe/webhook/route";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Webhook Stripe (Fase 4) con eventi firmati su whsec di test e Supabase
 * mockato: boost +5 atomico, doppia consegna → skip via RPC, firma
 * invalida → 400, subscription.deleted → plan free.
 */

vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ trackServer: vi.fn().mockResolvedValue(undefined) }));

const SECRET = "whsec_test_123";

/** Firma manuale nel format Stripe: t=<ts>,v1=HMAC_SHA256(secret, "<ts>.<payload>"). */
function signPayload(payload: string, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

function boostEvent(id = "evt_boost_1"): Stripe.Event {
  return {
    id,
    object: "event",
    api_version: "2025-02-24.acacia",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: "cs_test_1",
        object: "checkout.session",
        payment_status: "paid",
        metadata: { userId: "user-1", product: "boost" },
      },
    },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: "checkout.session.completed",
  } as unknown as Stripe.Event;
}

function subscriptionDeletedEvent(id = "evt_sub_del_1"): Stripe.Event {
  return {
    id,
    object: "event",
    api_version: "2025-02-24.acacia",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: "sub_test_1",
        object: "subscription",
        metadata: { userId: "user-1" },
      },
    },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: "customer.subscription.deleted",
  } as unknown as Stripe.Event;
}

function makeAdmin(opts?: { duplicate?: boolean; rpcError?: boolean }) {
  const rpc = vi.fn(async () => ({
    data: opts?.duplicate ? false : true,
    error: opts?.rpcError ? { message: "Transazione DB fallita" } : null,
  }));
  const admin = { rpc };
  vi.mocked(createAdminClient).mockReturnValue(admin as unknown as ReturnType<typeof createAdminClient>);
  return { admin, rpc };
}

function postEvent(event: Stripe.Event, signature: string) {
  const payload = JSON.stringify(event);
  const req = new Request("http://localhost:3000/api/stripe/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signature },
    body: payload,
  });
  return POST(req as unknown as NextRequest);
}

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.mocked(createAdminClient).mockReset();
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
  });

  afterEach(() => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("boost: process_stripe_event applica +5 in modo atomico", async () => {
    const { rpc } = makeAdmin();
    const event = boostEvent();
    const res = await postEvent(event, signPayload(JSON.stringify(event)));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("process_stripe_event", {
      p_event_id: "checkout:cs_test_1",
      p_user_id: "user-1",
      p_action: "boost",
    });
  });

  it("duplicato Stripe: la RPC restituisce false e non riaccredita", async () => {
    const { rpc } = makeAdmin({ duplicate: true });
    const event = boostEvent("evt_dup_1");
    const res = await postEvent(event, signPayload(JSON.stringify(event)));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true, duplicate: true });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("DB fallito: 500 perché Stripe deve ritentare l'intera transazione", async () => {
    const { rpc } = makeAdmin({ rpcError: true });
    const event = boostEvent("evt_award_fail");
    const res = await postEvent(event, signPayload(JSON.stringify(event)));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Evento non processato. Riprova." });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("process_stripe_event", {
      p_event_id: "checkout:cs_test_1",
      p_user_id: "user-1",
      p_action: "boost",
    });
  });

  it("pro_monthly: plan pro tramite RPC atomica", async () => {
    const { rpc } = makeAdmin();
    const event = {
      ...boostEvent("evt_plan"),
      data: { object: { id: "cs_pro", object: "checkout.session", payment_status: "paid", metadata: { userId: "user-1", product: "pro_monthly" } } },
    } as unknown as Stripe.Event;
    const res = await postEvent(event, signPayload(JSON.stringify(event)));
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("process_stripe_event", {
      p_event_id: "checkout:cs_pro",
      p_user_id: "user-1",
      p_action: "pro",
    });
  });

  it("pagamento in sospeso: nessun credito e nessun piano attivato", async () => {
    const { rpc } = makeAdmin();
    const event = boostEvent("evt_pending");
    (event.data.object as Stripe.Checkout.Session).payment_status = "unpaid";
    const res = await postEvent(event, signPayload(JSON.stringify(event)));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true, paymentPending: true });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("pagamento asincrono confermato: accredita solo dopo la conferma", async () => {
    const { rpc } = makeAdmin();
    const event = boostEvent("evt_async_paid");
    event.type = "checkout.session.async_payment_succeeded";
    const res = await postEvent(event, signPayload(JSON.stringify(event)));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("process_stripe_event", {
      p_event_id: "checkout:cs_test_1",
      p_user_id: "user-1",
      p_action: "boost",
    });
  });

  it("firma invalida: 400 e nessuna scrittura", async () => {
    const { rpc } = makeAdmin();
    const event = boostEvent("evt_bad_sig");
    const res = await postEvent(event, signPayload(JSON.stringify(event), "whsec_altro"));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Firma non valida." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("firma mancante: 400", async () => {
    const { rpc } = makeAdmin();
    const event = boostEvent("evt_no_sig");
    const res = await POST(
      new Request("http://localhost:3000/api/stripe/webhook", {
        method: "POST",
        body: JSON.stringify(event),
      }) as unknown as NextRequest
    );
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("webhook non configurato: 503", async () => {
    makeAdmin();
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const event = boostEvent("evt_no_conf");
    const res = await postEvent(event, signPayload(JSON.stringify(event)));
    expect(res.status).toBe(503);
  });

  it("subscription.deleted: plan free tramite RPC atomica", async () => {
    const { rpc } = makeAdmin();
    const event = subscriptionDeletedEvent();
    const res = await postEvent(event, signPayload(JSON.stringify(event)));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("process_stripe_event", {
      p_event_id: "evt_sub_del_1",
      p_user_id: "user-1",
      p_action: "free",
    });
  });

  it("evento sconosciuto: ack senza scritture", async () => {
    const { rpc } = makeAdmin();
    const event = { ...boostEvent("evt_other"), type: "customer.created" } as unknown as Stripe.Event;
    const res = await postEvent(event, signPayload(JSON.stringify(event)));
    expect(res.status).toBe(200);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("l'SDK reale Stripe accetta la firma HMAC del test", () => {
    const payload = JSON.stringify(boostEvent("evt_construct"));
    const verified = stripe().webhooks.constructEvent(payload, signPayload(payload), SECRET);
    expect(verified.type).toBe("checkout.session.completed");
  });
});
