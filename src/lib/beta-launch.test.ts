import { describe, expect, it } from "vitest";
import { betaInteractionsEnabled, commercialInteractionsEnabled, liveInteractionsEnabled } from "./launch-control";

const validBeta = {
  NODE_ENV: "production",
  VERCEL_ENV: "production",
  BETA_ENABLED: "true",
  BETA_READY_CONFIRMED: "true",
  BETA_ALLOWED_EMAILS: "first@example.com",
  LAUNCH_ENABLED: "false",
  NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test",
  SUPABASE_SERVICE_ROLE_KEY: "secret",
  ANTHROPIC_API_KEY: "secret",
  CRON_SECRET: "secret",
  SCHEDULER_CONFIRMED: "true",
  RESEND_API_KEY: "secret",
  RESEND_FROM: "demo@example.com",
  NEXT_PUBLIC_SITE_URL: "https://example.com",
};

describe("invite-only free beta launch gates", () => {
  it("can enable invited beta before Stripe is configured", () => {
    expect(betaInteractionsEnabled(validBeta)).toBe(true);
    expect(liveInteractionsEnabled(validBeta)).toBe(true);
    expect(commercialInteractionsEnabled(validBeta)).toBe(false);
  });
  it("does not activate with BETA_ENABLED alone", () => {
    expect(betaInteractionsEnabled({ ...validBeta, BETA_READY_CONFIRMED: "false" })).toBe(false);
  });
  it("requires the allowlist, cron verification and photo-serving backend", () => {
    expect(betaInteractionsEnabled({ ...validBeta, BETA_ALLOWED_EMAILS: "" })).toBe(false);
    expect(betaInteractionsEnabled({ ...validBeta, SCHEDULER_CONFIRMED: "false" })).toBe(false);
    expect(betaInteractionsEnabled({ ...validBeta, SUPABASE_SERVICE_ROLE_KEY: "" })).toBe(false);
    expect(betaInteractionsEnabled({ ...validBeta, ANTHROPIC_API_KEY: "" })).toBe(false);
  });
  it("does not silently grant commercial access when beta mode is on", () => {
    expect(commercialInteractionsEnabled(validBeta)).toBe(false);
  });
  it("does not expose credentials through the gate", () => {
    expect(typeof betaInteractionsEnabled(validBeta)).toBe("boolean");
  });
});
