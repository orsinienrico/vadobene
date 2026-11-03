import { describe, it, expect, vi, beforeEach } from "vitest";
import { looksLikeBodyReference } from "./body-reference";
import { moderateNote } from "./moderation";
import { anthropic } from "./anthropic";

/**
 * Accettazione Fase 2: "una nota con riferimenti al corpo viene marcata
 * filtered (test con 10 esempi, in italiano, inclusi eufemismi)".
 * Il fallback euristico non deve mai lasciare passare una nota sul corpo.
 *
 * Moderazione primaria (Anthropic Haiku, tool_choice forzato) testata con
 * l'SDK mockato: fail-closed su tool_use assente e su errori dell'SDK.
 */
const MUST_FILTER = [
  "Sei magra così, il vestito ci sta grande.",
  "Il problema non è l'abito, sei tu che sei grasso.",
  "Con quel pancione meglio un altro taglio.",
  "A 55 anni non si veste così.",
  "Brutta figura: sei troppo grassa per quel colore.",
  "Il tuo fisico non regge quel tessuto lucido.",
  "Ti sta stretta sulla pancia.",
  "Il problema è il viso, non l'abito.",
  "Come straniero meglio un look più sobrio.",
  "Un tocco etnico, esotico sul di lei pelle.", // eufemismo
];

const MUST_PASS = [
  "Le scarpe no, cambia solo quelle.",
  "Cintura più scura e sei a posto.",
  "Togli la giacca, fa troppo caldo per un matrimonio.",
  "Il blu ti sta meglio del nero, ma va bene così.",
  "Un orologio argento chiuderebbe il look.",
  "Troppo casual per un colloquio in banca.",
  "Semplice e centrato, vai tranquillo.",
  "La camicia stropicciata tradisce: stirala.",
  "Il colletto sbottonato di più, un tocco in meno.",
  "Pantaloni più lunghi, le scarpe si vedono poco.",
];

vi.mock("./anthropic", () => ({ anthropic: vi.fn() }));

/** Installa un client Anthropic mockato che risponde con i content dati. */
function mockCreate(content: unknown[]) {
  const create = vi.fn().mockResolvedValue({ content });
  vi.mocked(anthropic).mockReturnValue({
    messages: { create },
  } as unknown as ReturnType<typeof anthropic>);
  return create;
}

describe("moderazione note — fallback euristico", () => {
  it("filtra tutte le note con riferimenti al corpo/età/etnia", () => {
    for (const note of MUST_FILTER) {
      expect(looksLikeBodyReference(note), `dovrebbe filtrare: "${note}"`).toBe(true);
    }
  });

  it("lascia passare le note legittime sull'outfit", () => {
    for (const note of MUST_PASS) {
      expect(looksLikeBodyReference(note), `NON dovrebbe filtrare: "${note}"`).toBe(false);
    }
  });
});

describe("moderateNote — moderazione primaria (Anthropic mockato)", () => {
  beforeEach(() => {
    vi.mocked(anthropic).mockReset();
  });

  it("tool_use valido con status ok → nota passata", async () => {
    const create = mockCreate([
      { type: "tool_use", id: "t1", name: "set_moderation", input: { status: "ok", reason: "other" } },
    ]);
    const res = await moderateNote(MUST_PASS[0]);
    expect(res.status).toBe("ok");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("tool_use valido con status filtered → nota filtrata con reason", async () => {
    mockCreate([
      { type: "tool_use", id: "t2", name: "set_moderation", input: { status: "filtered", reason: "insult" } },
    ]);
    const res = await moderateNote("Troppo casual per un colloquio in banca.");
    expect(res.status).toBe("filtered");
    expect(res.reason).toBe("insult");
  });

  it("blocco tool_use assente → filtered (fail-closed)", async () => {
    mockCreate([{ type: "text", text: "Non ho usato il tool." }]);
    const res = await moderateNote(MUST_PASS[1]);
    expect(res.status).toBe("filtered");
    expect(res.reason).toBe("other");
  });

  it("input del tool non conforme al contratto → filtered", async () => {
    mockCreate([
      { type: "tool_use", id: "t3", name: "set_moderation", input: { status: "boh" } },
    ]);
    const res = await moderateNote(MUST_PASS[2]);
    expect(res.status).toBe("filtered");
  });

  it("throw dell'SDK → filtered (fail-closed)", async () => {
    const create = vi.fn().mockRejectedValue(new Error("API down"));
    vi.mocked(anthropic).mockReturnValue({
      messages: { create },
    } as unknown as ReturnType<typeof anthropic>);
    const res = await moderateNote(MUST_PASS[3]);
    expect(res.status).toBe("filtered");
    expect(res.reason).toBe("other");
  });

  it("l'euristica locale cortocircuita l'AI: match certo → niente chiamata Anthropic", async () => {
    const create = mockCreate([
      { type: "tool_use", id: "t4", name: "set_moderation", input: { status: "ok" } },
    ]);
    const res = await moderateNote("Sei magra così, il vestito ci sta grande.");
    expect(res.status).toBe("filtered");
    expect(res.reason).toBe("body");
    expect(create).not.toHaveBeenCalled();
    expect(vi.mocked(anthropic)).not.toHaveBeenCalled();
  });
});
