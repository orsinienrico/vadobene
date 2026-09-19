import { Brand } from "@/components/Brand";

export const metadata = {
  title: "Privacy — vado bene?",
};

/**
 * /privacy — Fase 5: in voce brand (BRAND.md §6: frasi corte, diretta).
 * Alla cieca, foto cancellate a 24h, nessun giudizio sul corpo.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-[640px] px-6 py-16">
      <Brand size={21} />
      <h1 className="mt-6 font-display text-3xl font-light">Privacy.</h1>

      <div className="mt-8 flex flex-col gap-6 text-[15px] leading-[1.7] text-gold">
        <p>
          Il voto è alla cieca. Chi risponde vede l&apos;outfit e l&apos;occasione, non il tuo
          nome, non il tuo profilo, non i tuoi follower. Tu non vedi chi ha risposto.
        </p>
        <p>
          La foto viene cancellata dopo 24 ore, a meno che tu non scelga di tenerla. La decidi tu,
          per ogni richiesta.
        </p>
        <p>
          Qui si giudica l&apos;outfit, mai la persona. Le righe che parlano del tuo corpo non
          passano: un filtro le stoppa prima che tu le legga.
        </p>
        <p>
          Puoi cancellare tutto — account, richieste, voti, foto — quando vuoi, dalla pagina{" "}
          <a href="/me" className="underline decoration-gold/40 hover:decoration-gold">
            Il tuo account
          </a>
          . Subito, senza scrivere a nessuno.
        </p>
        <p className="text-muted">
          Per qualunque altra cosa: ciao@vadobene.app
        </p>
      </div>
    </main>
  );
}
