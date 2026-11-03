import { Brand } from "./Brand";

/**
 * Hero (prototipo .hero): headline Fraunces 300, card-specimen inclinata
 * 2.5° con mini-thread, proof strip sotto.
 */
export function Hero() {
  return (
    <>
      <header
        className="relative grid min-h-svh items-center gap-12 overflow-hidden px-[8vw] pb-16 pt-[120px] lg:grid-cols-[1.1fr_.9fr] lg:text-left"
        style={{ backgroundColor: "transparent" }}
      >
        {/* bagliore radiale dietro la card (BRAND.md §4) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 45% at 78% 42%, rgba(127,200,192,.14), transparent 65%)",
          }}
        />

        <div className="text-center lg:text-left">
          <p className="mb-[22px] font-mono text-xs uppercase tracking-[0.22em] text-muted">
            Non un algoritmo. Cinque persone.
          </p>
          <h1 className="font-display text-[clamp(40px,5.4vw,72px)] font-light leading-[1.06] tracking-[-0.01em]">
            La domanda che fai
            <br />
            sulla porta di casa,
            <br />
            <span className="italic font-normal text-white">a chi non ti conosce.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-[46ch] text-[17px] text-muted lg:mx-0">
            Manda la foto, dì per cosa. Un primo parere in cinque secondi; poi, se vuoi la verità
            intera, <strong className="font-medium text-gold">cinque persone vere</strong> ti
            rispondono in tre minuti — alla cieca, senza doverti essere gentili.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-4 lg:justify-start">
            <a
              href="#flow"
              className="rounded-full bg-gold px-[34px] py-4 text-[15px] font-semibold tracking-[0.04em] text-ink transition-all hover:-translate-y-px hover:bg-gold-bright"
            >
              Vado bene? — provalo
            </a>
            <p className="text-[13px] text-muted">
              Gratis. Il primo parere, senza registrazione.
              <br />
              <b className="font-medium text-gold">Si giudica l&apos;outfit, mai la persona.</b>
            </p>
          </div>
        </div>

        <SpecimenCard />
      </header>

      <ProofStrip />
    </>
  );
}

/** Card-specimen: mini-thread + verdetto, inclinata 2.5°, ombra profonda. */
function SpecimenCard() {
  return (
    <div className="group mx-auto mt-2.5 w-[min(340px,86vw)] [perspective:900px] lg:justify-self-center" aria-hidden="true">
      <div className="rounded-[18px] border border-line bg-gradient-to-br from-panel-2 to-panel px-[22px] py-6 shadow-[0_30px_80px_rgba(0,0,0,0.55)] transition-transform duration-500 [transform:rotate(2.5deg)] group-hover:[transform:rotate(0deg)_translateY(-6px)]">
        <div className="mb-4 flex items-baseline justify-between border-b border-line pb-3.5">
          <Brand size={15} />
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">Colloquio</span>
        </div>

        <div className="flex flex-col gap-2">
          <div className="max-w-[82%] self-end rounded-[16px_16px_4px_16px] border border-line bg-gold/10 px-3 py-2.5 text-[13px]">
            <b className="font-semibold">Vado bene?</b> Colloquio in banca, domani.
          </div>
          <div className="self-center py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
            Inviato a 5 persone
          </div>
          <MiniRep n={1} v="yes" title="Funziona" text="Vai tranquillo." />
          <MiniRep n={2} v="tweak" title="Con una modifica" text="Le scarpe no, cambia solo quelle." />
          <MiniRep n={3} v="yes" title="Funziona" text="Sembri già assunto. Tranne ai piedi." />
        </div>

        <div className="mb-1 mt-[18px] font-display text-[34px] font-semibold leading-none text-gold">
          Sì. 4 su 5.
        </div>
        <div className="mb-3.5 font-mono text-xs tracking-[0.22em] text-ok">
          MODIFICA PIÙ VOTATA · LE SCARPE
        </div>
        <p className="border-t border-line pt-3.5 font-display text-[15px] italic leading-[1.45] text-gold">
          &quot;Sembri già assunto. Tranne ai piedi.&quot;
        </p>
        <p className="mt-3.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          vadobene.app — cinque persone vere, alla cieca
        </p>
      </div>
    </div>
  );
}

function MiniRep({ n, v, title, text }: { n: number; v: "yes" | "tweak" | "no"; title: string; text: string }) {
  const dot = v === "yes" ? "bg-ok" : v === "tweak" ? "bg-warn" : "bg-bad";
  const label = v === "yes" ? "text-ok" : v === "tweak" ? "text-warn" : "text-bad";
  return (
    <div className="flex max-w-[86%] items-start gap-2.5 self-start rounded-[16px_16px_16px_4px] border border-line bg-black/20 px-3 py-2.5 text-[13px] leading-[1.35]">
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-medium text-ink ${dot}`}>
        {n}
      </span>
      <span>
        <b className={`mb-px block font-mono text-[10px] uppercase tracking-[0.14em] ${label}`}>{title}</b>
        {text}
      </span>
    </div>
  );
}

function ProofStrip() {
  return (
    <section className="flex flex-wrap justify-center gap-[6vw] border-t border-gold/10 px-[8vw] pb-16 pt-[30px]">
      <div className="text-center">
        <p className="font-display text-[26px] font-semibold text-gold">5</p>
        <p className="text-[12.5px] tracking-[0.04em] text-muted">persone vere per risposta</p>
      </div>
      <div className="text-center">
        <p className="font-display text-[26px] font-semibold text-gold">3 min</p>
        <p className="text-[12.5px] tracking-[0.04em] text-muted">dalla foto alla risposta</p>
      </div>
      <div className="text-center">
        <p className="font-display text-[26px] font-semibold text-gold">0</p>
        <p className="text-[12.5px] tracking-[0.04em] text-muted">giudizi sul corpo. Solo outfit.</p>
      </div>
    </section>
  );
}
