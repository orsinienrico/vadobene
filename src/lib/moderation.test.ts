import { describe, it, expect } from "vitest";
import { looksLikeBodyReference } from "./body-reference";

/**
 * Accettazione Fase 2: "una nota con riferimenti al corpo viene marcata
 * filtered (test con 10 esempi, in italiano, inclusi eufemismi)".
 * Il fallback euristico non deve mai lasciare passare una nota sul corpo.
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
