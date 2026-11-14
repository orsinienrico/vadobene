import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/cron/expire-photos/route";
import { createAdminClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }));

describe("GET /api/cron/expire-photos — authorization", () => {
  beforeEach(() => {
    vi.mocked(createAdminClient).mockReset();
    delete process.env.CRON_SECRET;
  });
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("secret non configurato → 503 e zero chiamate Supabase", async () => {
    const res = await GET(new NextRequest("http://localhost:3000/api/cron/expire-photos"));
    expect(res.status).toBe(503);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("secret configurato, header assente → 401 e zero chiamate Supabase", async () => {
    process.env.CRON_SECRET = "test-cron-secret";
    const res = await GET(new NextRequest("http://localhost:3000/api/cron/expire-photos"));
    expect(res.status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("secret valido → coda vuota risponde 200", async () => {
    process.env.CRON_SECRET = "test-cron-secret";
    const req = new NextRequest("http://localhost:3000/api/cron/expire-photos", {
      headers: { authorization: "Bearer test-cron-secret" },
    });
    const query = { neq: vi.fn() };
    const neqResult = { not: vi.fn(() => ({
      order: () => ({ limit: async () => ({ data: [], error: null }) }),
    })) };
    query.neq.mockReturnValue(neqResult);
    const from = vi.fn(() => ({ select: () => ({ lt: () => ({ eq: () => query }) }) }));
    vi.mocked(createAdminClient).mockReturnValue({ from } as unknown as ReturnType<typeof createAdminClient>);

    const res = await GET(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ expired: 0 });
    expect(createAdminClient).toHaveBeenCalledTimes(1);
  });
});
