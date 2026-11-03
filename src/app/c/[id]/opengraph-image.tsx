import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/server";
import type { JurySummary } from "@/lib/contracts";

export const runtime = "nodejs";
export const size = { width: 1080, height: 1350 };
export const contentType = "image/png";
export const alt = "Card vado bene?";

const COLORS = {
  panel: "#143543",
  panel2: "#1B4353",
  gold: "#F2E9D8",
  muted: "#8FA6AE",
  ok: "#8FD3B3",
  warn: "#F0C674",
  bad: "#F19A88",
};

/**
 * Card condivisibile 1080×1350 (Fase 3) — convenzione next/og per le
 * metadata routes: default export. Stesso layout della card in-app.
 * La foto non è mai inclusa nella OG image (privacy di default).
 * Service role come la pagina /c/[id]: RLS blocca i non owner/giurati e
 * l'anteprima deve girare per chiunque riceva il link. Select limitata ai
 * soli campi pubblici.
 */
export default async function OgImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw new Error("not found");
  }

  const supabase = createAdminClient();
  const { data: request } = await supabase
    .from("requests")
    .select("jury_summary, occasion_id, custom_occasion")
    .eq("id", id)
    .eq("status", "jury_closed")
    .single();

  if (!request?.jury_summary) {
    throw new Error("not found");
  }

  const summary = request.jury_summary as JurySummary;

  let occasionLabel = request.custom_occasion ?? "";
  if (request.occasion_id) {
    const { data: occ } = await supabase
      .from("occasions")
      .select("label_it")
      .eq("id", request.occasion_id)
      .single();
    occasionLabel = occ?.label_it ?? occasionLabel;
  }

  const resultColor =
    summary.result === "yes" ? COLORS.ok : summary.result === "tweak" ? COLORS.warn : COLORS.bad;

  const dots = [
    ...Array(summary.yes).fill(COLORS.ok),
    ...Array(summary.tweak).fill(COLORS.warn),
    ...Array(summary.no).fill(COLORS.bad),
  ].slice(0, 5);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: `linear-gradient(160deg, ${COLORS.panel2}, ${COLORS.panel})`,
          border: "2px solid rgba(242,233,216,0.2)",
          borderRadius: 40,
          padding: 72,
          color: COLORS.gold,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.045em" }}>vado bene?</div>
          <div style={{ fontSize: 30, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 4 }}>
            {occasionLabel}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
          <div style={{ fontSize: 120, fontWeight: 700, color: resultColor, lineHeight: 1 }}>
            {summary.headline}
          </div>
          <div style={{ display: "flex", gap: 18 }}>
            {dots.map((c, i) => (
              <div key={i} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c }} />
            ))}
          </div>
          {summary.top_tweak && (
            <div style={{ fontSize: 38 }}>Modifica più votata: {summary.top_tweak}</div>
          )}
          {summary.quote && (
            <div style={{ fontSize: 42, fontStyle: "italic", borderLeft: "4px solid #F2E9D8", paddingLeft: 32 }}>
              &ldquo;{summary.quote}&rdquo;
            </div>
          )}
        </div>

        <div style={{ fontSize: 28, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 4 }}>
          {summary.ai_votes > 0
            ? `${summary.human_votes} PERSONE VERE + ${summary.ai_votes} PARERI AUTOMATICI`
            : "CINQUE PERSONE VERE · ALLA CIECA"}
          {" · vadobene.app"}
        </div>
      </div>
    ),
    size
  );
}
