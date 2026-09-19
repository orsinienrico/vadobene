/**
 * Fallback euristico della moderazione note (Fase 2).
 * La moderazione primaria è Anthropic Haiku (api/vote/route.ts). Questo
 * filtro gira in parallelo e come rete di sicurezza: una nota che matcha
 * qui viene marcata filtered a prescindere dall'AI. Mai un giudizio sul corpo.
 * Test: 10 esempi da filtrare + 10 da passare in moderation.test.ts.
 */
const BODY_PATTERNS = [
  /\b(magr[aoie]|grass[aoie]|cicci[oa]|pancion[ae]|pancia|panz[ae]|obes[oa])\b/i,
  /\b(vecchi[oaie]|anzian[oa]|eta|età|\d+\s*anni)\b/i,
  /\b(fisico|corpo|chil[oi]|taglia\s*(s|m|l|xl|xxl))\b/i,
  /\b(volt[oa]|facci[oa]|viso|capell[io]|pelle|occhi|nas[oa])\b/i,
  /\b(etni[oa]|etnia|razz[ao]|stranier[oa]|immigrant[oe])\b/i,
];

export function looksLikeBodyReference(note: string): boolean {
  return BODY_PATTERNS.some((re) => re.test(note));
}
