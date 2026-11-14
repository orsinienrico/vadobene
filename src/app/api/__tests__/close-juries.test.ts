import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/cron/close-juries/route";
import { createAdminClient } from "@/lib/supabase/server";
import { fillWithAiVotes, type AiGeneratedVote } from "@/lib/ai-fill";
import { moderateNote } from "@/lib/moderation";
import { sendEmail } from "@/lib/email";

/**
 * GET /api/cron/close-juries con Request finto, Supabase mockato (via
 * src/lib/supabase/server) e fill Anthropic controllato. Copertura delle fix:
 * - claim idempotente (P0-3): rpc → false o errore → skip, mai doppie email;
 * - chiusura anticipata a 5 voti umani (§6.3) senza fill;
 * - fill/summary throw → revert della request a jury_open (P1), niente email;
 * - Zod sul fill: verdict fuori enum → voto scartato (ai_votes resta 0);
 * - moderazione nota AI filtered → nota null, voto conservato (fail-closed).
 */

vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/ai-fill", () => ({ fillWithAiVotes: vi.fn() }));
vi.mock("@/lib/moderation", () => ({ moderateNote: vi.fn() }));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async () => ({ id: "email_1" })),
  juryClosedEmail: vi.fn(() => ({ subject: "Giurì chiusa", html: "<p>Ecco.</p>" })),
}));

// Wrapper SDK Anthropic mockato: serve ai test che usano il fillWithAiVotes
// REALE (verdict fuori enum, nota filtered).
const { anthropicCreate } = vi.hoisted(() => ({ anthropicCreate: vi.fn() }));
vi.mock("@/lib/anthropic", () => ({
  anthropic: () => ({ messages: { create: anthropicCreate } }),
}));

// Il fillWithAiVotes reale, per i test Zod/moderazione attraverso la route.
const realAiFill = await vi.importActual<typeof import("@/lib/ai-fill")>("@/lib/ai-fill");

const OWNER_ID = "11111111-2222-4333-8444-555555555555";

type VoteRow = { verdict: string; note: string | null; note_status: string; is_ai: boolean };
type OpenRequest = {
  id: string;
  occasion_id: number | null;
  custom_occasion: string | null;
  jury_deadline_at: string | null;
  votes_target: number | null;
  user_id: string;
};

const openRequest = (patch: Partial<OpenRequest> = {}): OpenRequest => ({
  id: "req-1",
  occasion_id: null,
  custom_occasion: "Matrimonio",
  jury_deadline_at: new Date(Date.now() - 60_000).toISOString(), // scaduta
  votes_target: 5,
  user_id: OWNER_ID,
  ...patch,
});

const humanVote = (verdict: string, note: string | null): VoteRow => ({
  verdict,
  note,
  note_status: "ok",
  is_ai: false,
});

const aiVote = (n: number): AiGeneratedVote[] =>
  Array.from({ length: n }, () => ({
    verdict: "yes" as const,
    note: "giacca pulita",
    note_status: "ok" as const,
    is_ai: true,
  }));

/**
 * Mock del client service role (createAdminClient) per il cron:
 * - requests: select.eq → thenable con .single (per il fill reale, photo_path
 *   null → niente storage) e update.eq.eq che registra {id, patch};
 * - votes: eq("is_ai") → .in (conteggio umani); eq("request_id") → i voti;
 *   insert (per il fill reale) registrato in `inserted`;
 * - users: select.eq.single → owner email;
 * - rpc claim_jury_close → true per gli id in `claimed`, false per gli altri.
 */
function makeCronAdmin(opts: {
  open?: OpenRequest[];
  openError?: { message: string };
  humanVotes?: { request_id: string; is_ai: boolean }[];
  votesByRequest?: Record<string, VoteRow[]>;
  claimed?: string[];
  claimError?: { message: string };
  ownerEmail?: string | null;
}) {
  const updatePatches: { id: string; patch: Record<string, unknown> }[] = [];
  const inserted: Record<string, unknown>[] = [];

  const update = vi.fn((patch: Record<string, unknown>) => ({
    eq: (_col: string, id: string) => ({
      eq: (_status: string, _val: string) => {
        updatePatches.push({ id, patch });
        return Promise.resolve({ error: null });
      },
    }),
  }));

  const inFn = vi.fn(async () => ({ data: opts.humanVotes ?? [], error: null }));
  const votesEq = vi.fn((col: string, value?: unknown) => {
    if (col === "is_ai") return { in: inFn };
    // select("verdict, ...").eq("request_id", id) → awaitato direttamente.
    const rows = opts.votesByRequest?.[String(value)] ?? [];
    return Promise.resolve({ data: rows, error: null });
  });
  const votesInsert = vi.fn(async (row: Record<string, unknown>) => {
    inserted.push(row);
    return { error: null };
  });

  const reqSingle = vi.fn(async () => ({ data: { photo_path: null }, error: null }));
  const reqEq = vi.fn(() => ({
    single: reqSingle,
    order: () => ({
      limit: async () => ({ data: opts.open ?? [], error: opts.openError ?? null }),
    }),
    // select(...).eq("status", "jury_open") → awaitato direttamente (thenable).
    then(onOk?: (v: unknown) => unknown) {
      return Promise.resolve(onOk?.({ data: opts.open ?? [], error: opts.openError ?? null }));
    },
  }));

  const usersSingle = vi.fn(async () => ({
    data: opts.ownerEmail === undefined ? { email: "owner@test.dev" } : opts.ownerEmail ? { email: opts.ownerEmail } : null,
    error: null,
  }));
  const usersSelect = vi.fn(() => ({ eq: () => ({ single: usersSingle }) }));

  const rpc = vi.fn(async (_fn: string, args: { p_request_id: string }) => {
    if (opts.claimError) return { data: null, error: opts.claimError };
    return { data: opts.claimed?.includes(args.p_request_id) ?? true, error: null };
  });

  const from = vi.fn((table: string) => {
    if (table === "requests") return { select: () => ({ eq: reqEq }), update };
    if (table === "votes") return { select: () => ({ eq: votesEq }), insert: votesInsert };
    if (table === "users") return { select: usersSelect };
    return {};
  });

  const admin = { from, rpc };
  vi.mocked(createAdminClient).mockReturnValue(admin as unknown as ReturnType<typeof createAdminClient>);
  return { updatePatches, inserted, rpc };
}

function get(url = "http://localhost:3000/api/cron/close-juries", authorized = true) {
  const secret = process.env.CRON_SECRET;
  const headers: Record<string, string> = authorized && secret ? { authorization: "Bearer " + secret } : {};
  return GET(new NextRequest(url, { headers }));
}

describe("GET /api/cron/close-juries", () => {
  beforeEach(() => {
    vi.mocked(createAdminClient).mockReset();
    vi.mocked(fillWithAiVotes).mockReset();
    vi.mocked(moderateNote).mockReset();
    vi.mocked(sendEmail).mockReset();
    anthropicCreate.mockReset();
    process.env.CRON_SECRET = "test-cron-secret";
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("claim idempotente (P0-3): seconda invocazione → false → skip, una sola email", async () => {
    const { updatePatches, rpc } = makeCronAdmin({
      open: [openRequest({ id: "req-1" }), openRequest({ id: "req-2" })],
      humanVotes: [
        { request_id: "req-1", is_ai: false },
        { request_id: "req-1", is_ai: false },
        { request_id: "req-2", is_ai: false },
        { request_id: "req-2", is_ai: false },
      ],
      votesByRequest: {
        "req-1": [humanVote("tweak", "allarga le spalle"), humanVote("tweak", "scarpe più sobrie")],
      },
      claimed: ["req-1"], // req-2: il secondo chiamante concorrente riceve false
    });
    vi.mocked(fillWithAiVotes).mockResolvedValue(aiVote(3));

    const res = await get();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ closed: 1, ids: ["req-1"] });
    expect(rpc).toHaveBeenCalledTimes(2);
    // Solo req-1 chiusa: update summary una volta, email una volta.
    expect(updatePatches).toHaveLength(1);
    expect(updatePatches[0].id).toBe("req-1");
    expect(updatePatches[0].patch).toHaveProperty("jury_summary");
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("claim errore DB → skip del request, closed 0", async () => {
    const { updatePatches } = makeCronAdmin({
      open: [openRequest()],
      humanVotes: [{ request_id: "req-1", is_ai: false }],
      claimError: { message: "RPC giù" },
    });
    vi.mocked(fillWithAiVotes).mockResolvedValue([]);

    const res = await get();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ closed: 0, ids: [] });
    expect(updatePatches).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("chiusura anticipata a 5 voti umani (§6.3): niente fill, summary yes 5", async () => {
    const { updatePatches } = makeCronAdmin({
      open: [openRequest({ jury_deadline_at: new Date(Date.now() + 120_000).toISOString() })],
      humanVotes: Array.from({ length: 5 }, () => ({ request_id: "req-1", is_ai: false })),
      votesByRequest: {
        "req-1": Array.from({ length: 5 }, () => humanVote("yes", "cappe giuste")),
      },
    });
    vi.mocked(fillWithAiVotes).mockResolvedValue([]);

    const res = await get();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ closed: 1, ids: ["req-1"] });
    expect(fillWithAiVotes).not.toHaveBeenCalled(); // deadline futura, 5/5 umani
    expect(updatePatches[0].patch).toEqual({
      jury_summary: expect.objectContaining({
        yes: 5,
        tweak: 0,
        no: 0,
        human_votes: 5,
        ai_votes: 0,
        result: "yes",
        headline: "Sì. 5 su 5.",
      }),
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("fill/summary throw → revert della request a jury_open, niente email (P1)", async () => {
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
    const { updatePatches } = makeCronAdmin({
      open: [openRequest()],
      humanVotes: [
        { request_id: "req-1", is_ai: false },
        { request_id: "req-1", is_ai: false },
      ],
      votesByRequest: { "req-1": [humanVote("tweak", "allarga le spalle"), humanVote("tweak", null)] },
    });
    // Il fill throw (Anthropic giù): il cron deve ripristinare jury_open, non
    // lasciare la request chiusa senza summary né email.
    vi.mocked(fillWithAiVotes).mockRejectedValue(new Error("Anthropic giù"));

    const res = await get();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ closed: 0, ids: [] });
    // Revert: update con status jury_open, NESSUN jury_summary.
    expect(updatePatches).toHaveLength(1);
    expect(updatePatches[0]).toEqual({ id: "req-1", patch: { status: "jury_open" } });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(consoleErr).toHaveBeenCalled();
    consoleErr.mockRestore();
  });

  it("Zod sul fill: verdict fuori enum → voto scartato, ai_votes resta 0", async () => {
    const { updatePatches, inserted } = makeCronAdmin({
      open: [openRequest()],
      humanVotes: [
        { request_id: "req-1", is_ai: false },
        { request_id: "req-1", is_ai: false },
      ],
      votesByRequest: { "req-1": [humanVote("tweak", "allarga le spalle"), humanVote("tweak", null)] },
    });
    // fillWithAiVotes REALE con l'SDK Anthropic mockato: il giudice risponde
    // "maybe" (fuori enum) → AiFillVote.safeParse fallisce → voto scartato.
    vi.mocked(fillWithAiVotes).mockImplementation((supabase, request, missing) =>
      realAiFill.fillWithAiVotes(supabase, request, missing)
    );
    anthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: '{"verdict":"maybe","note":"bella"}' }],
    });

    const res = await get();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ closed: 1, ids: ["req-1"] });
    expect(anthropicCreate).toHaveBeenCalledTimes(3); // 3 voti mancanti tentati
    expect(inserted).toHaveLength(0); // nessun voto non conforme in tabella
    expect(updatePatches[0].patch).toEqual({
      jury_summary: expect.objectContaining({ human_votes: 2, ai_votes: 0, result: "tweak" }),
    });
  });

  it("moderazione nota AI filtered → nota null, voto conservato (fail-closed)", async () => {
    const { updatePatches, inserted } = makeCronAdmin({
      open: [openRequest({ votes_target: 3 })],
      humanVotes: [
        { request_id: "req-1", is_ai: false },
        { request_id: "req-1", is_ai: false },
      ],
      votesByRequest: {
        "req-1": [humanVote("tweak", "allarga le spalle"), humanVote("tweak", "scarpe più sobrie")],
      },
    });
    // fillWithAiVotes REALE: verdetto valido ma la nota passa dalla moderazione
    // (mockata) che la filtra → nota null, note_status filtered, voto inserito.
    vi.mocked(fillWithAiVotes).mockImplementation((supabase, request, missing) =>
      realAiFill.fillWithAiVotes(supabase, request, missing)
    );
    anthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: '{"verdict":"yes","note":"Sei magra così"}' }],
    });
    vi.mocked(moderateNote).mockResolvedValue({ status: "filtered", reason: "body" });

    const res = await get();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ closed: 1, ids: ["req-1"] });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toEqual(
      expect.objectContaining({
        request_id: "req-1",
        juror_id: null,
        verdict: "yes",
        note: null,
        is_ai: true,
        note_status: "filtered",
      })
    );
    // Il voto AI filtrato conta come voto (is_ai), la nota non compare mai.
    expect(updatePatches[0].patch).toEqual({
      jury_summary: expect.objectContaining({ human_votes: 2, ai_votes: 1, result: "tweak" }),
    });
  });

  it("CRON_SECRET impostato senza header → 401", async () => {
    makeCronAdmin({ open: [openRequest()] });
    process.env.CRON_SECRET = "s3cr3t-test";

    const res = await get("http://localhost:3000/api/cron/close-juries", false);

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("CRON_SECRET mancante → 503, non accede al DB", async () => {
    const { rpc } = makeCronAdmin({ open: [openRequest()] });
    delete process.env.CRON_SECRET;
    const res = await get();
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: "Cron non configurato." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("coda vuota → { closed: 0 } senza toccare niente", async () => {
    const { updatePatches, rpc } = makeCronAdmin({ open: [] });

    const res = await get();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ closed: 0 });
    expect(rpc).not.toHaveBeenCalled();
    expect(updatePatches).toHaveLength(0);
  });
});
