import type { AiVerdict } from "@/lib/contracts";

const HEAD: Record<AiVerdict["verdict"], string> = {
  yes: "Sì.",
  tweak: "Sì, con una modifica.",
  no: "No.",
};

const HEAD_COLOR: Record<AiVerdict["verdict"], string> = {
  yes: "text-ok",
  tweak: "text-warn",
  no: "text-bad",
};

/**
 * Bolla del primo parere AI (prototipo .aibox).
 * L'AI si dichiara sempre: "Primo parere · automatico" (BRAND.md §6).
 */
export function AiReply({ verdict, occasion }: { verdict: AiVerdict; occasion: string }) {
  return (
    <div className="max-w-[92%] self-start rounded-[18px_18px_18px_4px] border border-line bg-gradient-to-br from-panel-2 to-panel px-6 py-6">
      <span className="mb-2.5 block font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted">
        Primo parere · automatico · {occasion}
      </span>
      <div className={`mb-2.5 font-display text-[34px] font-semibold leading-none ${HEAD_COLOR[verdict.verdict]}`}>
        {HEAD[verdict.verdict]}
      </div>
      {verdict.tweak && <p className="text-[14.5px] text-gold">{verdict.tweak}</p>}
      <div className="mt-3 border-t border-line pt-3 font-display text-base italic">{verdict.one_liner}</div>
    </div>
  );
}
