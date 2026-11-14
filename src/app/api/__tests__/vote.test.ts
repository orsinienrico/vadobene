import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { POST } from "@/app/api/vote/route";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { moderateNote } from "@/lib/moderation";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock("@/lib/moderation", () => ({ moderateNote: vi.fn() }));

const REQUEST_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

let currentRequestRow: { id: string; status: string; user_id: string; jury_deadline_at: string | null };

function makeClient(opts?: {
  requestRow?: { id: string; status: string; user_id: string; jury_deadline_at: string | null };
  unauthenticated?: boolean;
}) {
  currentRequestRow = opts?.requestRow ??
    { id: REQUEST_ID, status: "jury_open", user_id: "owner-1", jury_deadline_at: null };
  const single = vi.fn(async () => ({
    data: opts?.requestRow ??
      { id: REQUEST_ID, status: "jury_open", user_id: "owner-1", jury_deadline_at: null },
    error: null,
  }));
  const select = vi.fn(() => ({ eq: () => ({ single }) }));
  const from = vi.fn(() => ({ select }));
  const client = {
    auth: { getUser: vi.fn(async () => ({
      data: { user: opts?.unauthenticated ? null : { id: "juror-1" } },
    })) },
    from,
  };
  vi.mocked(createClient).mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>);
  return { from };
}

function makeAdmin(opts?: { rpcError?: { code: string }; credit?: number }) {
  const rpc = vi.fn(async () => ({
    data: opts?.rpcError ? null : (opts?.credit ?? 1),
    error: opts?.rpcError ?? null,
  }));
  const from = vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(async () => ({ data: currentRequestRow, error: null })),
      })),
    })),
  }));
  const admin = { rpc, from };
  vi.mocked(createAdminClient).mockReturnValue(admin as unknown as ReturnType<typeof createAdminClient>);
  return { rpc, admin };
}

function post(body: unknown) {
  return POST(new Request("http://localhost:3000/api/vote", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest);
}

describe("POST /api/vote — DB transactional award", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(createAdminClient).mockReset();
    vi.mocked(moderateNote).mockReset();
    vi.mocked(moderateNote).mockResolvedValue({ status: "ok" });
  });

  it("valid vote → one RPC that inserts vote and credits in the same transaction", async () => {
    makeClient();
    const { rpc } = makeAdmin({ credit: 3 });
    const res = await post({ requestId: REQUEST_ID, verdict: "yes" });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ credit: 3, noteStatus: "ok" });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("record_jury_vote", {
      p_request_id: REQUEST_ID, p_juror_id: "juror-1", p_verdict: "yes",
      p_note: null, p_note_status: "ok",
    });
  });

  it("invalid body → 400 and no RPC", async () => {
    makeClient();
    const { rpc } = makeAdmin();
    const res = await post({ requestId: REQUEST_ID, verdict: "boh" });
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("duplicate vote (23505) → 409 with no second award", async () => {
    makeClient();
    const { rpc } = makeAdmin({ rpcError: { code: "23505" } });
    const res = await post({ requestId: REQUEST_ID, verdict: "yes" });
    expect(res.status).toBe(409);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("late vote or closed jury at DB transaction time → 409", async () => {
    makeClient();
    makeAdmin({ rpcError: { code: "P0001" } });
    const res = await post({ requestId: REQUEST_ID, verdict: "yes" });
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "Il giurì non accetta più voti." });
  });

  it("jury closed before moderation → 409 without DB award", async () => {
    makeClient({ requestRow: { id: REQUEST_ID, status: "jury_closed", user_id: "owner-1", jury_deadline_at: null } });
    const { rpc } = makeAdmin();
    const res = await post({ requestId: REQUEST_ID, verdict: "yes" });
    expect(res.status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("self vote rejected at API and DB uses 42501 if raced", async () => {
    makeClient({ requestRow: { id: REQUEST_ID, status: "jury_open", user_id: "juror-1", jury_deadline_at: null } });
    const { rpc } = makeAdmin();
    const res = await post({ requestId: REQUEST_ID, verdict: "yes" });
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("atomic RPC error → 500, not partial success", async () => {
    makeClient();
    const { rpc } = makeAdmin({ rpcError: { code: "XX000" } });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post({ requestId: REQUEST_ID, verdict: "tweak" });
    expect(res.status).toBe(500);
    expect(rpc).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });

  it("moderated note filtered → null stored and verdict retained", async () => {
    makeClient();
    const { rpc } = makeAdmin({ credit: 9 });
    vi.mocked(moderateNote).mockResolvedValue({ status: "filtered" });
    const res = await post({ requestId: REQUEST_ID, verdict: "yes", note: "Commento sul corpo." });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ credit: 9, noteStatus: "filtered" });
    expect(rpc).toHaveBeenCalledWith("record_jury_vote", expect.objectContaining({
      p_note: null, p_note_status: "filtered", p_verdict: "yes",
    }));
  });

  it("unauthenticated → 401", async () => {
    makeClient({ unauthenticated: true });
    const { rpc } = makeAdmin();
    const res = await post({ requestId: REQUEST_ID, verdict: "yes" });
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
});
