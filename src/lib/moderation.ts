import { anthropic } from "./anthropic";
import { NoteModeration } from "./contracts";
import { looksLikeBodyReference } from "./body-reference";

/**
 * Moderazione note — PRODUCT-SPEC §3: si giudica l'outfit, MAI la persona.
 * Primaria: Anthropic Haiku, temperatura 0. Fallback: euristica locale + fail-closed.
 */
const MODERATION_SYSTEM = `Sei il moderatore delle note di un'app di outfit. Una nota è scritta da un giurato anonimo su un outfit per un'occasione. Regola assoluta: si giudica l'outfit, MAI la persona. Marca "filtered" se la nota contiene riferimenti al corpo, al fisico, al peso, all'età, all'etnia, o è un insulto verso la persona. Eufemismi e ironia contano: "sei magra così" va filtrata. Note sull'outfit, sui colori, sulle scarpe, sugli accessori, sul contesto sono "ok".`;

const moderationTool = {
  name: "set_moderation",
  description: "Registra l'esito della moderazione della nota.",
  input_schema: {
    type: "object" as const,
    properties: {
      status: { type: "string", enum: ["ok", "filtered"] },
      reason: { type: "string", enum: ["body", "age", "ethnicity", "insult", "other"] },
    },
    required: ["status"],
  },
};

export async function moderateNote(
  note: string
): Promise<{ status: "ok" | "filtered"; reason?: string }> {
  // Rete di sicurezza locale: match certo → filtered senza chiamare l'AI.
  if (looksLikeBodyReference(note)) {
    return { status: "filtered", reason: "body" };
  }

  try {
    const response = await anthropic().messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 100,
      temperature: 0,
      system: MODERATION_SYSTEM,
      tools: [moderationTool],
      tool_choice: { type: "tool", name: "set_moderation" },
      messages: [{ role: "user", content: `Nota da moderare: "${note}"` }],
    });

    const block = response.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      // In dubbio, filtra: meglio una nota in meno che un giudizio sul corpo.
      return { status: "filtered", reason: "other" };
    }
    const parsed = NoteModeration.parse(block.input);
    return { status: parsed.status, reason: parsed.reason };
  } catch {
    // Moderazione irraggiungibile: fail-closed.
    return { status: "filtered", reason: "other" };
  }
}
