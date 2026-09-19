import Anthropic from "@anthropic-ai/sdk";
import type { AiVerdict as AiVerdictT } from "./contracts";

/**
 * Prompt di sistema per il verdetto — PRODUCT-SPEC.md §6.5 (bozza ufficiale).
 * Giudica coerenza outfit/occasione, MAI il corpo.
 */
export const VERDICT_SYSTEM_PROMPT = `Sei un parere onesto sull'adeguatezza di un outfit per un'occasione. Giudichi *coerenza tra outfit e occasione*, mai il corpo, il peso, l'età o l'aspetto della persona. Rispondi con un solo verdetto tra: funziona / funziona con una modifica / non funziona. Se suggerisci una modifica, è una sola, concreta, eseguibile in un minuto (cambia le scarpe, togli la giacca). Chiudi con una frase breve, diretta, che resta in mente; mai crudele, mai entusiasta. Se la foto non contiene un outfit riconoscibile, o contiene nudità o minori, imposta unsafe_content = true e non dare verdetto.`;

/** Struttura di output attesa da Anthropic (tool choice forzato). */
export const verdictTool = {
  name: "set_verdict",
  description: "Registra il verdetto sull'outfit.",
  input_schema: {
    type: "object" as const,
    properties: {
      verdict: { type: "string", enum: ["yes", "tweak", "no"] },
      tweak: {
        type: ["string", "null"],
        description: "Una sola modifica concreta, o null se il verdetto è yes/no senza modifica.",
      },
      one_liner: { type: "string", description: "La frase che resta, max 90 caratteri." },
      confidence: { type: "string", enum: ["low", "med", "high"] },
      unsafe_content: { type: "boolean" },
    },
    required: ["verdict", "tweak", "one_liner", "confidence", "unsafe_content"],
  },
};

let _client: Anthropic | null = null;

/** Client Anthropic — solo server-side, mai importato dal client. */
export function anthropic(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

/**
 * Chiama Anthropic (vision) per il primo parere.
 * Modello: claude-sonnet-4-5 (Fase 1 dell'IMPLEMENTATION-PROMPT).
 */
export async function getAiVerdict(
  photoBase64: string,
  occasionLabel: string
): Promise<AiVerdictT> {
  const mediaType = detectMediaType(photoBase64);
  const raw = photoBase64.replace(/^data:[^;]+;base64,/, "");

  const response = await anthropic().messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 400,
    system: VERDICT_SYSTEM_PROMPT,
    tools: [verdictTool],
    tool_choice: { type: "tool", name: "set_verdict" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: raw },
          },
          {
            type: "text",
            text: `Occasione: ${occasionLabel}. L'outfit funziona per questa occasione?`,
          },
        ],
      },
    ],
  });

  const block = response.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error("Anthropic non ha restituito un verdetto strutturato");
  }
  return block.input as AiVerdictT;
}

function detectMediaType(dataUrl: string): "image/jpeg" | "image/png" | "image/webp" | "image/gif" {
  if (dataUrl.startsWith("data:image/png")) return "image/png";
  if (dataUrl.startsWith("data:image/webp")) return "image/webp";
  if (dataUrl.startsWith("data:image/gif")) return "image/gif";
  return "image/jpeg";
}
