import Link from "next/link";
import { Brand } from "@/components/Brand";
import { Hero } from "@/components/Hero";
import { Flow } from "@/components/Flow";
import { liveInteractionsEnabled } from "@/lib/launch-control";

export default function Home() {
  // Local development and Playwright mocks remain usable without external keys.
  // Vercel environments must pass the release gate before collecting photos.
  const liveFlowEnabled = liveInteractionsEnabled(process.env);
  const inviteOnly = process.env.BETA_ENABLED === "true" && process.env.LAUNCH_ENABLED !== "true";
  return (
    <>
      <nav className="fixed inset-x-0 top-0 z-50 flex items-center justify-between bg-gradient-to-b from-ink/95 to-transparent px-6 py-4">
        <a href="#top" aria-label="vado bene? — torna su">
          <Brand size={21} />
        </a>
        <a
          href={inviteOnly ? "/login" : "#flow"}
          className="rounded-full bg-gold px-5 py-2.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink transition-colors hover:bg-gold-bright"
        >
          {inviteOnly ? "Entra" : liveFlowEnabled ? "Prova ora" : "Anteprima"}
        </a>
      </nav>

      <div id="top" />
      <Hero />
      <div id="flow">
        <Flow enabled={liveFlowEnabled} inviteOnly={inviteOnly} />
      </div>

      <section className="mx-auto max-w-[640px] border-t border-gold/10 px-6 py-20 text-center">
        <h2 className="font-display text-[clamp(24px,3vw,34px)] font-normal italic leading-[1.3]">
          &quot;Un outfit non è giusto o sbagliato in assoluto. È giusto o sbagliato per un contesto
          — e a dirlo devono essere gli altri, non un algoritmo.&quot;
        </h2>
        <p className="mt-[18px] text-[15px] text-muted">
          vado bene? non giudica le persone. Chiede a cinque persone vere, alla cieca, se
          l&apos;outfit funziona per quell&apos;occasione. Se mancano voti umani, i voti AI
          vengono indicati separatamente nel risultato.
        </p>
      </section>

      <footer className="border-t border-gold/10 px-6 pb-[60px] pt-10 text-center text-[12.5px] text-muted">
        <Brand size={18} />
        <p className="mt-2">
          Lo specchio che non mente. © Orsini&amp;Co. ·{" "}
          <Link href="/privacy" className="underline decoration-muted/40 hover:decoration-muted">
            Privacy
          </Link>
        </p>
      </footer>
    </>
  );
}
