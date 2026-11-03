import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { POST } from "@/app/api/vote/route";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { moderateNote } from "@/lib/moderation";

/**
 * POST /api/vote con Request finto, Zod valido e Supabase mockato (via
 * src/lib/supabase/server): doppio voto (23505) → 409, giurì chiusa → 409,
 * self-vote → 403, award RPC fallisce → voto comunque salvato (scelta WS1),
 * nota filtrata dalla moderazione → nota null ma voto conservato.
 */

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock("@/lib/moderation", () => ({ moderateNote: vi.fn() }));

const REQUEST_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

type InsertResult = { error: { code: string } | null };

/** Mock del client utente (createClient): auth.getUser, requests.single, votes.insert. */
function makeClient(opts?: {
  requestRow?: { id: string; status: string; user_id: string; jury_deadline_at: string | null };
  insertError?: { code: string };
}) {
  const insert = vi.fn(async () => ({ error: opts?.insertError ?? null }) as InsertResult);
  const single = vi.fn(async () => ({
    data:
      opts?.requestRow ??
      { id: REQUEST_ID, status: "jury_open", user_id: "owner-1", jury_deadline_at: null },
    error: null,
  }));
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn((table: string) => (table === "votes" ? { insert } : { select }));
  const client = {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "juror-1" } } })) },
    from,
  };
  vi.mocked(createClient).mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>);
  return { client, insert };
}

/** Mock del client service role (createAdminClient): users.upsert, users.select, RPC. */
function makeAdmin(opts?: { rpcError?: boolean; freshCredit?: number }) {
  const rpc = vi.fn(async () => ({
    data: undefined,
    error: opts?.rpcError ? { message: "RPC giù" } : null,
  }));
  const upsert = vi.fn(async () => ({ error: null }));
  const freshSingle = vi.fn(async () => ({ data: { jury_credit: opts?.freshCredit ?? 1 }, error: null }));
  const selectEq = vi.fn(() => ({ single: freshSingle }));
  const select = vi.fn(() => ({ eq: selectEq }));
  const from = vi.fn(() => ({ upsert, select }));
  const admin = { from, rpc };
  vi.mocked(createAdminClient).mockReturnValue(admin as unknown as ReturnType<typeof createAdminClient>);
  return { admin, rpc, freshSingle };
}

function post(body: unknown) {
  const req = new Request("http://localhost:3000/api/vote", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(req as unknown as NextRequest);
}

describe("POST /api/vote", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(createAdminClient).mockReset();
    vi.mocked(moderateNote).mockReset();
    vi.mocked(moderateNote).mockResolvedValue({ status: "ok" });
  });

  it("voto valido → 200 con credit aggiornato e notaStatus ok", async () => {
    makeClient();
    makeAdmin({ freshCredit: 3 });

    const res = await post({ requestId: REQUEST_ID, verdict: "yes" });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ credit: 3, noteStatus: "ok" });
  });

  it("body non valido (verdict fuori enum) → 400", async () => {
    makeClient();
    makeAdmin();

    const res = await post({ requestId: REQUEST_ID, verdict: "boh" });

    expect(res.status).toBe(400);
  });

  it("23505 su insert (doppio voto) → 409 'Hai già votato'", async () => {
    const { insert } = makeClient({ insertError: { code: "23505" } });
    makeAdmin();

    const res = await post({ requestId: REQUEST_ID, verdict: "yes" });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "Hai già votato questa richiesta." });
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("giurì chiusa (status !== jury_open) → 409", async () => {
    makeClient({ requestRow: { id: REQUEST_ID, status: "jury_closed", user_id: "owner-1", jury_deadline_at: null } });
    makeAdmin();

    const res = await post({ requestId: REQUEST_ID, verdict: "yes" });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "Il giurì non è più aperto." });
  });

  it("self-vote (request dell'utente stesso) → 403", async () => {
    makeClient({ requestRow: { id: REQUEST_ID, status: "jury_open", user_id: "juror-1", jury_deadline_at: null } });
    makeAdmin();

    const res = await post({ requestId: REQUEST_ID, verdict: "yes" });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Non puoi votare la tua richiesta." });
  });

  it("award RPC fallisce → voto comunque salvato, risposta 200", async () => {
    const { insert } = makeClient();
    // freshCredit 0: il credito non è stato accreditato, ma il voto resta.
    const { rpc } = makeAdmin({ rpcError: true, freshCredit: 0 });

    const res = await post({ requestId: REQUEST_ID, verdict: "tweak" });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ credit: 0, noteStatus: "ok" });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("award_jury_credit", { p_user_id: "juror-1", p_amount: 1 });
  });

  it("nota filtrata dalla moderazione → insert con nota null, voto conservato", async () => {
    const { insert } = makeClient();
    makeAdmin();
    // Contratto reale di moderateNote: ok | filtered (fail-closed). Esito
    // filtered → la nota non arriva mai in tabella, il voto conserva il verdetto.
    vi.mocked(moderateNote).mockResolvedValue({ status: "filtered" });

    const res = await post({ requestId: REQUEST_ID, verdict: "yes", note: "Sei magra così." });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ credit: 1, noteStatus: "filtered" });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ note: null, note_status: "filtered", verdict: "yes" })
    );
  });

  it("utente non autenticato → 401", async () => {
    const client = {
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      from: vi.fn(),
    };
    vi.mocked(createClient).mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>);
    makeAdmin();

    const res = await post({ requestId: REQUEST_ID, verdict: "yes" });

    expect(res.status).toBe(401);
  });
});
