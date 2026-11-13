import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { POST } from "@/app/api/jury/open/route";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/**
 * POST /api/jury/open con Request finto e Supabase mockato (via
 * src/lib/supabase/server). Copertura delle fix di concorrenza:
 * - claim atomico dello stato PRIMA della spend (P2): due POST concorrenti —
 *   il secondo matcha 0 righe → 409, mai doppia spesa di 5 crediti;
 * - race persa sulla spend con allowAi=true → apre comunque (P3/P0-1), senza
 *   spendere: fill AI dichiarato alla chiusura;
 * - spend failure dopo il claim → revert a ai_done + 500;
 * - credito sufficiente → spend chiamata; credito < 5 → 402 {allowAnyway: true};
 * - 401 / 404 come da route.
 */

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));

const REQUEST_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const USER_ID = "11111111-2222-4333-8444-555555555555";
let serverOnlyUpdate: ReturnType<typeof vi.fn> | null = null;

/**
 * Mock del client utente (createClient): auth.getUser, users.single,
 * requests find (select→eq→eq→order→limit→single), requests claim
 * (update→eq→eq→select che conta le righe) e requests revert
 * (update→eq→eq senza select, thenable — il contatore `reverts` ne traccia
 * l'invocazione).
 */
function makeUserClient(opts?: {
  userId?: string | null;
  profileError?: boolean;
  credit?: number;
  aiDoneRequest?: { id: string; status: string } | null;
  aiDoneError?: boolean;
  /** Righe restituite dall'update di claim (0 → un altro POST ha già aperto). */
  claimRows?: number;
  claimError?: boolean;
}) {
  const userId = opts?.userId === undefined ? USER_ID : opts.userId;
  const requestId = opts?.aiDoneRequest?.id ?? REQUEST_ID;

  // users: select("jury_credit, plan").eq("id", userId).single()
  const usersSingle = vi.fn(async () => ({
    data: opts?.profileError ? null : { jury_credit: opts?.credit ?? 7, plan: "free" },
    error: opts?.profileError ? { message: "profilo giù" } : null,
  }));
  const usersSelect = vi.fn(() => ({ eq: () => ({ single: usersSingle }) }));

  // requests find: select("id, status").eq("user_id").eq("status","ai_done")
  //   .order().limit(1).single()
  const findSingle = vi.fn(async () => {
    if (opts?.aiDoneError) return { data: null, error: { message: "request giù" } };
    if (opts && "aiDoneRequest" in opts && opts.aiDoneRequest === null) {
      return { data: null, error: { code: "PGRST116", message: "no rows" } };
    }
    return { data: opts?.aiDoneRequest ?? { id: REQUEST_ID, status: "ai_done" }, error: null };
  });
  const findSelect = vi.fn(() => ({
    eq: () => ({
      eq: () => ({ order: () => ({ limit: () => ({ single: findSingle }) }) }),
    }),
  }));

  // claim: update().eq("id").eq("status","ai_done").select("id")
  const claimSelect = vi.fn(async () => {
    if (opts?.claimError) return { data: null, error: { message: "claim giù" } };
    const rows = opts?.claimRows ?? 1;
    return {
      data: Array.from({ length: rows }, () => ({ id: requestId })),
      error: null,
    };
  });

  // revert: update().eq("id").eq("status","jury_open") — awaitato senza select.
  // Il thenable conta le invocazioni: ogni `reverts` è un revert effettivo.
  let reverts = 0;
  const updateChain = {
    select: claimSelect,
    then(onOk?: (v: unknown) => unknown) {
      reverts += 1;
      return Promise.resolve(onOk?.({ error: null }));
    },
  };
  const update = vi.fn(() => ({ eq: () => ({ eq: () => ({ eq: () => updateChain }) }) }));
  serverOnlyUpdate = update;

  const from = vi.fn((table: string) =>
    table === "users" ? { select: usersSelect } : { select: findSelect, update }
  );

  const client = {
    auth: { getUser: vi.fn(async () => ({ data: { user: userId ? { id: userId } : null } })) },
    from,
  };
  vi.mocked(createClient).mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>);
  return { claimSelect, update, getReverts: () => reverts };
}

/** Mock del client service role (createAdminClient): rpc spend_jury_credit. */
function makeAdmin(opts?: { spendErr?: boolean; spent?: boolean }) {
  const rpc = vi.fn(async () => ({
    data: opts?.spendErr ? null : (opts?.spent ?? true),
    error: opts?.spendErr ? { message: "RPC giù" } : null,
  }));
  const admin = { rpc, from: vi.fn(() => ({ update: serverOnlyUpdate })) };
  vi.mocked(createAdminClient).mockReturnValue(admin as unknown as ReturnType<typeof createAdminClient>);
  return { rpc, from: admin.from };
}

function post(body: unknown) {
  const req = new Request("http://localhost:3000/api/jury/open", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(req as unknown as NextRequest);
}

describe("POST /api/jury/open", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(createAdminClient).mockReset();
  });

  it("credito sufficiente → 200, spend_jury_credit chiamata con p_cost 5", async () => {
    const { claimSelect, getReverts } = makeUserClient({ credit: 5 });
    const { rpc } = makeAdmin({ spent: true });

    const res = await post({});

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      requestId: REQUEST_ID,
      deadline: expect.any(String),
      durationSeconds: 180,
    });
    expect(claimSelect).toHaveBeenCalledTimes(1); // claim prima della spend
    expect(rpc).toHaveBeenCalledWith("spend_jury_credit", {
      p_user_id: USER_ID,
      p_cost: 5,
    });
    expect(getReverts()).toBe(0);
  });

  it("credito < 5 (allowAi assente) → 402 {allowAnyway: true}, revert del claim", async () => {
    const { getReverts } = makeUserClient({ credit: 3 });
    const { rpc } = makeAdmin();

    const res = await post({});

    expect(res.status).toBe(402);
    await expect(res.json()).resolves.toEqual({
      error: "Credito insufficiente.",
      credit: 3,
      allowAnyway: true,
    });
    expect(rpc).not.toHaveBeenCalled(); // mai una spesa sotto soglia
    expect(getReverts()).toBe(1); // claim aperto → revert a ai_done
  });

  it("allowAi=true con credito < 5 → 200, apre SENZA spendere (fill AI dichiarato)", async () => {
    const { claimSelect, getReverts } = makeUserClient({ credit: 3 });
    const { rpc } = makeAdmin();

    const res = await post({ allowAi: true });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      requestId: REQUEST_ID,
      deadline: expect.any(String),
      durationSeconds: 180,
    });
    expect(rpc).not.toHaveBeenCalled(); // nessuna spesa
    expect(claimSelect).toHaveBeenCalledTimes(1); // il claim apre il giurì
    expect(getReverts()).toBe(0);
  });

  it("claim fallito (già aperta da un altro POST) → 409, nessuna spend", async () => {
    const { getReverts } = makeUserClient({ credit: 5, claimRows: 0 });
    const { rpc } = makeAdmin();

    const res = await post({});

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "Giurì già aperto.",
      requestId: REQUEST_ID,
    });
    expect(rpc).not.toHaveBeenCalled(); // mai una doppia spesa di 5 crediti
    expect(getReverts()).toBe(0);
  });

  it("spend failure dopo il claim → revert a ai_done + 500", async () => {
    const { getReverts } = makeUserClient({ credit: 5 });
    const { rpc } = makeAdmin({ spendErr: true });

    const res = await post({});

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Credito non aggiornato." });
    expect(getReverts()).toBe(1); // la request torna ai_done
  });

  it("race persa sulla spend (credito sceso) senza allowAi → revert + 402", async () => {
    const { getReverts } = makeUserClient({ credit: 5 });
    const { rpc } = makeAdmin({ spent: false });

    const res = await post({});

    expect(res.status).toBe(402);
    await expect(res.json()).resolves.toEqual({
      error: "Credito insufficiente.",
      credit: 5,
      allowAnyway: true,
    });
    expect(getReverts()).toBe(1);
  });

  it("race persa sulla spend con allowAi=true → 200, giurì aperto comunque (P3)", async () => {
    const { getReverts } = makeUserClient({ credit: 5 });
    const { rpc } = makeAdmin({ spent: false });

    const res = await post({ allowAi: true });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ requestId: REQUEST_ID, durationSeconds: 180 });
    expect(getReverts()).toBe(0); // nessun revert: la giurì resta aperta
  });

  it("claim errore DB → 500 'Giurì non aperto. Riprova.'", async () => {
    makeUserClient({ credit: 5, claimError: true });
    makeAdmin();

    const res = await post({});

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Giurì non aperto. Riprova." });
  });

  it("utente non autenticato → 401", async () => {
    makeUserClient({ userId: null });
    makeAdmin();

    const res = await post({});

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Serve un account." });
  });

  it("profilo mancante → 404", async () => {
    makeUserClient({ profileError: true });
    makeAdmin();

    const res = await post({});

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Profilo non trovato." });
  });

  it("nessuna request in ai_done → 404", async () => {
    makeUserClient({ aiDoneRequest: null });
    makeAdmin();

    const res = await post({});

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Nessuna richiesta pronta per il giurì." });
  });

  it("body non valido (allowAi non boolean) → 400", async () => {
    makeUserClient();
    makeAdmin();

    const res = await post({ allowAi: "sì" });

    expect(res.status).toBe(400);
  });
});
