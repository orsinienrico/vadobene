import { describe, expect, it } from "vitest";
import { releaseReadiness } from "./release-readiness";

const complete = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-test-key",
  SUPABASE_SERVICE_ROLE_KEY: "server-test-key",
  ANTHROPIC_API_KEY: "test-key",
  CRON_SECRET: "test-cron-secret",
  SCHEDULER_CONFIRMED: "true",
  STRIPE_SECRET_KEY: "sk_test",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  STRIPE_PRICE_BOOST: "price_boost",
  STRIPE_PRICE_PRO_MONTHLY: "price_month",
  STRIPE_PRICE_PRO_YEARLY: "price_year",
  RESEND_API_KEY: "re_test",
  RESEND_FROM: "vado bene? <service@example.org>",
  NEXT_PUBLIC_SITE_URL: "https://example.org",
};

describe("release readiness — configuration-only gate", () => {
  it("non considera ready un ambiente vuoto", () => {
    const result = releaseReadiness({});
    expect(result.configured).toBe(false);
    expect(Object.values(result.services).every((ok) => !ok)).toBe(true);
  });

  it("configurazione completa può abilitare la release", () => {
    const result = releaseReadiness(complete);
    expect(result.configured).toBe(true);
    expect(Object.values(result.services).every(Boolean)).toBe(true);
  });

  it("rifiuta una release se lo scheduler non è stato verificato", () => {
    expect(releaseReadiness({ ...complete, SCHEDULER_CONFIRMED: "false" }).configured).toBe(false);
  });

  it("rifiuta release con pagamenti non configurati", () => {
    const { STRIPE_WEBHOOK_SECRET: _unused, ...env } = complete;
    expect(releaseReadiness(env).services.payments).toBe(false);
  });

  it("non restituisce mai valori di credenziali", () => {
    const result = JSON.stringify(releaseReadiness(complete));
    expect(result).not.toContain("sk_test");
    expect(result).not.toContain("server-test-key");
  });
});
