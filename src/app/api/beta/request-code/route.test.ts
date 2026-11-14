import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/beta/request-code/route";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const variables: Record<string, string> = {
  BETA_ENABLED: "true",
  BETA_READY_CONFIRMED: "true",
  BETA_ALLOWED_EMAILS: "tester@example.com",
  LAUNCH_ENABLED: "false",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-test-key",
  SUPABASE_SERVICE_ROLE_KEY: "server-test-key",
  ANTHROPIC_API_KEY: "test-key",
  CRON_SECRET: "test-secret",
  SCHEDULER_CONFIRMED: "true",
  RESEND_API_KEY: "test-resend",
  RESEND_FROM: "tester@example.com",
  NEXT_PUBLIC_SITE_URL: "https://beta.example.com",
};
const original = Object.fromEntries(
  Object.keys(variables).map((key) => [key, process.env[key]])
);

function request(email: unknown, origin = "https://beta.example.com") {
  return new NextRequest("https://beta.example.com/api/beta/request-code", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

describe("POST /api/beta/request-code", () => {
  const otp = vi.fn(async () => ({ error: null }));
  beforeEach(() => {
    for (const [key, value] of Object.entries(variables)) process.env[key] = value;
    vi.mocked(createClient).mockReset();
    otp.mockReset();
    otp.mockResolvedValue({ error: null });
    vi.mocked(createClient).mockResolvedValue({
      auth: { signInWithOtp: otp },
    } as unknown as Awaited<ReturnType<typeof createClient>>);
  });
  afterEach(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("allows an invited address without public account creation", async () => {
    const res = await POST(request("TESTER@EXAMPLE.COM"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(otp).toHaveBeenCalledWith({
      email: "tester@example.com",
      options: { shouldCreateUser: false },
    });
  });

  it("never sends email to uninvited addresses, without leaking membership", async () => {
    const res = await POST(request("outsider@example.com"));
    expect(res.status).toBe(200);
    expect(createClient).not.toHaveBeenCalled();
    expect(otp).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({
      ok: true,
      message: "Se l'indirizzo è invitato, riceverai un codice.",
    });
  });

  it("refuses missing or invalid email", async () => {
    expect((await POST(request("invalid"))).status).toBe(400);
    expect(otp).not.toHaveBeenCalled();
  });

  it("denies cross-origin requests", async () => {
    expect((await POST(request("tester@example.com", "https://attacker.example"))).status).toBe(403);
    expect(otp).not.toHaveBeenCalled();
  });

  it("fails closed if beta has not been approved", async () => {
    process.env.BETA_READY_CONFIRMED = "false";
    expect((await POST(request("tester@example.com"))).status).toBe(503);
    expect(otp).not.toHaveBeenCalled();
  });

  it("does not reveal auth provider errors or address membership", async () => {
    otp.mockResolvedValue({ error: { code: "over_email_send_rate_limit" } });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(request("tester@example.com"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      message: "Se l'indirizzo è invitato, riceverai un codice.",
    });
    spy.mockRestore();
  });
});
