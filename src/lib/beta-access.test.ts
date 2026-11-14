import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { betaModeRequested, isBetaEmailInvited, requireBetaInvite } from "./beta-access";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

describe("invite-only beta allowlist", () => {
  it("accepts only exact, case-insensitive invited addresses", () => {
    const allow = " a@example.com ,Team.Beta@example.org ";
    expect(isBetaEmailInvited("A@EXAMPLE.COM", allow)).toBe(true);
    expect(isBetaEmailInvited(" team.beta@example.org ", allow)).toBe(true);
    expect(isBetaEmailInvited("a@example.com.evil.test", allow)).toBe(false);
    expect(isBetaEmailInvited("outsider@example.com", allow)).toBe(false);
  });
  it("fails closed when the list or email is missing", () => {
    expect(isBetaEmailInvited("a@example.com", undefined)).toBe(false);
    expect(isBetaEmailInvited(undefined, "a@example.com")).toBe(false);
    expect(isBetaEmailInvited("not-an-email", "not-an-email")).toBe(false);
  });
  it("never activates for a full launch or without explicit enablement", () => {
    expect(betaModeRequested({ BETA_ENABLED: "true", LAUNCH_ENABLED: "false" })).toBe(true);
    expect(betaModeRequested({ BETA_ENABLED: "true", LAUNCH_ENABLED: "true" })).toBe(false);
    expect(betaModeRequested({})).toBe(false);
  });
});

describe("server-side beta auth guard", () => {
  const original = {
    BETA_ENABLED: process.env.BETA_ENABLED,
    LAUNCH_ENABLED: process.env.LAUNCH_ENABLED,
    BETA_ALLOWED_EMAILS: process.env.BETA_ALLOWED_EMAILS,
  };
  beforeEach(() => {
    process.env.BETA_ENABLED = "true";
    process.env.LAUNCH_ENABLED = "false";
    process.env.BETA_ALLOWED_EMAILS = "tester@example.com";
    vi.mocked(createClient).mockReset();
  });
  afterEach(() => {
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  function user(email: string | null, is_anonymous = false) {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: email ? { email, id: "uid", is_anonymous } : null }, error: null }) },
    } as unknown as Awaited<ReturnType<typeof createClient>>);
  }

  it("requires a login", async () => {
    user(null);
    const denied = await requireBetaInvite();
    expect(denied?.status).toBe(401);
  });
  it("denies anonymous Supabase users even if email matches", async () => {
    user("tester@example.com", true);
    const denied = await requireBetaInvite();
    expect(denied?.status).toBe(401);
  });
  it("denies authenticated non-invited users", async () => {
    user("someone.else@example.com");
    const denied = await requireBetaInvite();
    expect(denied?.status).toBe(403);
  });
  it("allows only invited, authenticated email", async () => {
    user("TESTER@EXAMPLE.COM");
    expect(await requireBetaInvite()).toBeNull();
  });
  it("fails closed if invite list is missing", async () => {
    user("tester@example.com");
    delete process.env.BETA_ALLOWED_EMAILS;
    expect((await requireBetaInvite())?.status).toBe(403);
  });
});
