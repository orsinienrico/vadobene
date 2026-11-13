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
          La foto serve per ottenere il parere. Durante il giurì può essere visualizzata
          da altri partecipanti autorizzati mediante collegamenti temporanei.
          Per le foto senza conservazione esplicita, la cancellazione automatica inizia
          dopo 24 ore: i controlli periodici possono causare un ritardo rispetto alla soglia.
          Non considerare la foto immediatamente cancellata quando il giurì termina.
        </p>
        <p>
          Qui si giudica l&apos;outfit, mai la persona. Le righe che parlano del tuo corpo non
          passano: un filtro le stoppa prima che tu le legga.
        </p>
        <p>
          Puoi richiedere la cancellazione di account, richieste, voti e foto dalla pagina{" "}
          <a href="/me" className="underline decoration-gold/40 hover:decoration-gold">
            Il tuo account
          </a>
          . Se la cancellazione non riesce, riceverai un errore anziché una falsa conferma.
        </p>
        <p className="text-muted">
          Per qualunque altra cosa: ciao@vadobene.app
        </p>
      </div>
    </main>
  );
}
