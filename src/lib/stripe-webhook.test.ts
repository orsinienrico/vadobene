import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { POST } from "@/app/api/stripe/webhook/route";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Webhook Stripe (Fase 4) con eventi firmati su whsec di test e Supabase
 * mockato: boost +5, doppia consegna → skip (ledger processed_events), firma
 * invalida → 400, subscription.deleted → plan free.
 */

vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }));

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

type InsertResult = { error: { code: string } | null };
type RpcResult = { data: unknown; error: { message: string } | null };

function makeAdmin(opts?: { insertError?: { code: string }; rpcError?: boolean; updateError?: boolean }) {
  const insert = vi.fn(async () => ({ error: opts?.insertError ?? null }) as InsertResult);
  const rpc = vi.fn(async () =>
    ({ data: undefined, error: opts?.rpcError ? { message: "RPC giù" } : null }) as RpcResult
  );
  const delEq = vi.fn(async () => ({ data: null, error: null }));
  const del = vi.fn(() => ({ eq: delEq }));
  const updateEq = vi.fn(async () => ({
    data: null,
    error: opts?.updateError ? { message: "update giù" } : null,
  }));
  const update = vi.fn(() => ({ eq: updateEq }));
  const admin = { from: vi.fn(() => ({ insert, update, delete: del })), rpc };
  vi.mocked(createAdminClient).mockReturnValue(admin as unknown as ReturnType<typeof createAdminClient>);
  return { admin, insert, rpc, update, updateEq, del, delEq };
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

  it("checkout.session.completed con product=boost → award_jury_credit +5", async () => {
    const { insert, rpc } = makeAdmin();
    const event = boostEvent();

    const res = await postEvent(event, signPayload(JSON.stringify(event)));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
    expect(insert).toHaveBeenCalledWith({ id: "evt_boost_1" });
    expect(rpc).toHaveBeenCalledWith("award_jury_credit", { p_user_id: "user-1", p_amount: 5 });
  });

  it("doppia consegna dello stesso event.id → skip (200, nessun +5)", async () => {
    const { insert, rpc } = makeAdmin({ insertError: { code: "23505" } });
    const event = boostEvent("evt_dup_1");

    const res = await postEvent(event, signPayload(JSON.stringify(event)));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true, duplicate: true });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("award fallito → ledger ripulito + 500 (Stripe ritrasmette, P1)", async () => {
    const { insert, rpc, del, delEq } = makeAdmin({ rpcError: true });
    const event = boostEvent("evt_award_fail");

    const res = await postEvent(event, signPayload(JSON.stringify(event)));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Evento non processato. Riprova." });
    expect(insert).toHaveBeenCalledWith({ id: "evt_award_fail" });
    expect(rpc).toHaveBeenCalledWith("award_jury_credit", { p_user_id: "user-1", p_amount: 5 });
    expect(del).toHaveBeenCalledTimes(1);
    expect(delEq).toHaveBeenCalledWith("id", "evt_award_fail");
  });

  it("update plan fallito → ledger ripulito + 500", async () => {
    const { rpc, del, delEq } = makeAdmin({ updateError: true });
    const event = {
      ...boostEvent("evt_plan_fail"),
      data: {
        object: {
          id: "cs_test_plan",
          object: "checkout.session",
          metadata: { userId: "user-1", product: "pro_monthly" },
        },
      },
    } as unknown as Stripe.Event;

    const res = await postEvent(event, signPayload(JSON.stringify(event)));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Evento non processato. Riprova." });
    expect(rpc).not.toHaveBeenCalled();
    expect(delEq).toHaveBeenCalledWith("id", "evt_plan_fail");
  });

  it("firma invalida → 400, nessuna scrittura", async () => {
    const { insert, rpc } = makeAdmin();
    const event = boostEvent("evt_bad_sig");

    const res = await postEvent(event, signPayload(JSON.stringify(event), "whsec_altro"));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Firma non valida." });
    expect(insert).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("firma mancante → 400", async () => {
    const { insert } = makeAdmin();
    const event = boostEvent("evt_no_sig");

    const res = await POST(
      new Request("http://localhost:3000/api/stripe/webhook", {
        method: "POST",
        body: JSON.stringify(event),
      }) as unknown as NextRequest
    );

    expect(res.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });

  it("webhook non configurato → 503", async () => {
    makeAdmin();
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const event = boostEvent("evt_no_conf");

    const res = await postEvent(event, signPayload(JSON.stringify(event)));

    expect(res.status).toBe(503);
  });

  it("customer.subscription.deleted → plan free", async () => {
    const { update, updateEq } = makeAdmin();
    const event = subscriptionDeletedEvent();

    const res = await postEvent(event, signPayload(JSON.stringify(event)));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
    expect(update).toHaveBeenCalledWith({ plan: "free" });
    expect(updateEq).toHaveBeenCalledWith("id", "user-1");
  });

  it("evento boost con verify sull'SDK reale: constructEvent accetta la firma manuale", () => {
    // Guardia del test stesso: la firma costruita a mano deve essere valida
    // anche per stripe.webhooks.constructEvent (lo stesso check del handler).
    const payload = JSON.stringify(boostEvent("evt_construct"));
    const signature = signPayload(payload);
    const verified = stripe().webhooks.constructEvent(payload, signature, SECRET);
    expect(verified.type).toBe("checkout.session.completed");
  });
});
