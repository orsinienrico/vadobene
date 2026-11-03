import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AiFillVote } from "./contracts";
import { fillWithAiVotes } from "./ai-fill";
import { anthropic } from "./anthropic";
import { moderateNote } from "./moderation";

/**
 * Contratto AiFillVote (output del giudice nel cron close-juries) e funzione
 * estratta fillWithAiVotes con l'SDK Anthropic mockato: JSON non conforme o
 * verdict fuori enum → voto scartato (mai insert).
 */

vi.mock("./anthropic", () => ({ anthropic: vi.fn() }));
vi.mock("./moderation", () => ({ moderateNote: vi.fn() }));

describe("contratto AiFillVote (Zod)", () => {
  it("JSON valido → parse ok (nota opzionale e nullable)", () => {
    expect(AiFillVote.safeParse({ verdict: "yes", note: "Bene così" }).success).toBe(true);
    expect(AiFillVote.safeParse({ verdict: "tweak" }).success).toBe(true);
    expect(AiFillVote.safeParse({ verdict: "no", note: null }).success).toBe(true);
  });

  it("verdict fuori enum → scartato", () => {
    expect(AiFillVote.safeParse({ verdict: "maybe", note: "ok" }).success).toBe(false);
    expect(AiFillVote.safeParse({ verdict: "FUNZIONA" }).success).toBe(false);
    expect(AiFillVote.safeParse({}).success).toBe(false);
  });

  it("nota oltre il limite → rifiutata dal contratto; dentro il limite → ok", () => {
    expect(AiFillVote.safeParse({ verdict: "yes", note: "x".repeat(281) }).success).toBe(false);
    // La nota troncata a 60 dal cron rientra nel limite.
    expect(AiFillVote.safeParse({ verdict: "tweak", note: "x".repeat(60) }).success).toBe(true);
  });
});

/** Mock del client admin: occasions/requests con .single(), storage.download, votes.insert. */
function makeSupabase(opts?: { labelIt?: string; photoPath?: string | null }) {
  const insert = vi.fn(async (): Promise<{ error: unknown }> => ({ error: null }));
  let lastTable = "";
  const single = vi.fn(async () => {
    // .single() è l'ultimo anello: risponde in base alla tabella dell'ultimo .from().
    if (lastTable === "occasions") return { data: { label_it: opts?.labelIt ?? "Colloquio" } };
    return { data: { photo_path: opts?.photoPath ?? null } };
  });
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn((table: string) => {
    lastTable = table;
    if (table === "votes") return { insert };
    return { select };
  });
  const download = vi.fn(async () => ({ data: null }));
  const supabase = {
    from,
    storage: { from: vi.fn(() => ({ download })) },
  } as unknown as SupabaseClient;
  return { supabase, insert, download };
}

/** Installa un giudice AI che risponde col testo dato (blocco "text"). */
function mockAiText(text: string) {
  const create = vi.fn().mockResolvedValue({ content: [{ type: "text", text }] });
  vi.mocked(anthropic).mockReturnValue({
    messages: { create },
  } as unknown as ReturnType<typeof anthropic>);
  return create;
}

const REQUEST = { id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301", occasion_id: 1, custom_occasion: null };

describe("fillWithAiVotes — funzione estratta (Anthropic mockato)", () => {
  beforeEach(() => {
    vi.mocked(anthropic).mockReset();
    vi.mocked(moderateNote).mockReset();
    vi.mocked(moderateNote).mockResolvedValue({ status: "ok" });
  });

  it("JSON valido → voto inserito con is_ai=true, nota moderata ok", async () => {
    mockAiText('Premessa. {"verdict":"tweak","note":"Cambia le scarpe"} Fine.');
    const { supabase, insert } = makeSupabase();

    const generated = await fillWithAiVotes(supabase, REQUEST, 1);

    expect(generated).toHaveLength(1);
    expect(generated[0]).toEqual({
      verdict: "tweak",
      note: "Cambia le scarpe",
      note_status: "ok",
      is_ai: true,
    });
    expect(insert).toHaveBeenCalledWith({
      request_id: REQUEST.id,
      juror_id: null,
      verdict: "tweak",
      note: "Cambia le scarpe",
      is_ai: true,
      note_status: "ok",
    });
  });

  it("verdict fuori enum → voto NON inserito", async () => {
    mockAiText('{"verdict":"maybe","note":"ok"}');
    const { supabase, insert } = makeSupabase();

    const generated = await fillWithAiVotes(supabase, REQUEST, 1);

    expect(generated).toEqual([]);
    expect(insert).not.toHaveBeenCalled();
  });

  it("JSON non parseabile → voto NON inserito (niente regex improvvisate)", async () => {
    mockAiText("Non è JSON: funziona così.");
    const { supabase, insert } = makeSupabase();

    const generated = await fillWithAiVotes(supabase, REQUEST, 1);

    expect(generated).toEqual([]);
    expect(insert).not.toHaveBeenCalled();
  });

  it("nota troncata a 60 caratteri e moderata; filtered → nota null ma voto conservato", async () => {
    mockAiText(`{"verdict":"yes","note":"${"x".repeat(100)}"}`);
    vi.mocked(moderateNote).mockResolvedValue({ status: "filtered" });
    const { supabase, insert } = makeSupabase();

    const generated = await fillWithAiVotes(supabase, REQUEST, 1);

    expect(generated).toHaveLength(1);
    expect(generated[0]).toMatchObject({ verdict: "yes", note: null, note_status: "filtered" });
    expect(moderateNote).toHaveBeenCalledWith("x".repeat(60));
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ note: null, note_status: "filtered" }));
  });

  it("throw dell'SDK → nessun voto generato, nessun crash", async () => {
    const create = vi.fn().mockRejectedValue(new Error("API down"));
    vi.mocked(anthropic).mockReturnValue({
      messages: { create },
    } as unknown as ReturnType<typeof anthropic>);
    const { supabase, insert } = makeSupabase();

    const generated = await fillWithAiVotes(supabase, REQUEST, 1);

    expect(generated).toEqual([]);
    expect(insert).not.toHaveBeenCalled();
  });

  it("insert rifiutato → il voto non conta come generato", async () => {
    mockAiText('{"verdict":"no","note":null}');
    const { supabase, insert } = makeSupabase();
    insert.mockResolvedValue({ error: { code: "23503" } });

    const generated = await fillWithAiVotes(supabase, REQUEST, 1);

    expect(generated).toEqual([]);
  });
});
