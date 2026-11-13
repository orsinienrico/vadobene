import { describe, expect, it } from "vitest";
import { liveInteractionsEnabled } from "./launch-control";
import { isTrustedMutationOrigin, trustedSiteOrigin } from "./request-security";

const ready = {
  NODE_ENV: "production",
  VERCEL_ENV: "production",
  LAUNCH_ENABLED: "true",
  NEXT_PUBLIC_SUPABASE_URL: "https://db.example.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "role-key",
  ANTHROPIC_API_KEY: "anthropic-key",
  CRON_SECRET: "cron-key",
  SCHEDULER_CONFIRMED: "true",
  STRIPE_SECRET_KEY: "stripe-key",
  STRIPE_WEBHOOK_SECRET: "whsec-key",
  STRIPE_PRICE_BOOST: "price-1",
  STRIPE_PRICE_PRO_MONTHLY: "price-2",
  STRIPE_PRICE_PRO_YEARLY: "price-3",
  RESEND_API_KEY: "resend-key",
  RESEND_FROM: "me@example.com",
  NEXT_PUBLIC_SITE_URL: "https://vadobene.app",
};

describe("production launch kill switch", () => {
  it("closed without explicit opt-in, even when all integrations exist", () => {
    expect(liveInteractionsEnabled({ ...ready, LAUNCH_ENABLED: undefined })).toBe(false);
    expect(liveInteractionsEnabled({ ...ready, LAUNCH_ENABLED: "false" })).toBe(false);
    expect(liveInteractionsEnabled({ ...ready, SCHEDULER_CONFIRMED: "false" })).toBe(false);
  });
  it("opens only with explicit enablement and integration readiness", () => {
    expect(liveInteractionsEnabled(ready)).toBe(true);
    expect(liveInteractionsEnabled({ ...ready, SUPABASE_SERVICE_ROLE_KEY: "" })).toBe(false);
  });
  it("allows local dev mock flow but never unconfigured production Docker", () => {
    expect(liveInteractionsEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(liveInteractionsEnabled({ NODE_ENV: "production" })).toBe(false);
  });
});

describe("payment redirect and mutation origin security", () => {
  const headers = (origin?: string, site?: string) => ({
    get: (name: string) => name === "origin" ? origin ?? null : name === "sec-fetch-site" ? site ?? null : null,
  });
  it("only accepts a trusted site URL, never a request-provided host", () => {
    expect(trustedSiteOrigin(ready)).toBe("https://vadobene.app");
    expect(trustedSiteOrigin({ ...ready, NEXT_PUBLIC_SITE_URL: "javascript:alert(1)" })).toBeNull();
    expect(trustedSiteOrigin({ ...ready, NEXT_PUBLIC_SITE_URL: "http://evil.example" })).toBeNull();
  });
  it("rejects cross-site POST and forged origins", () => {
    expect(isTrustedMutationOrigin(headers("https://evil.example"), ready)).toBe(false);
    expect(isTrustedMutationOrigin(headers("https://vadobene.app", "cross-site"), ready)).toBe(false);
    expect(isTrustedMutationOrigin(headers("https://vadobene.app", "same-origin"), ready)).toBe(true);
    expect(isTrustedMutationOrigin(headers(undefined, "cross-site"), ready)).toBe(false);
  });
  it("permits browser same-origin with a trusted Origin and server-side missing Origin", () => {
    expect(isTrustedMutationOrigin(headers(undefined, undefined), ready)).toBe(true);
    expect(isTrustedMutationOrigin(headers(undefined, "same-origin"), ready)).toBe(true);
  });
});
