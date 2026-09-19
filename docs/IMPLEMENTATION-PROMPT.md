# Prompt per Claude Code — vado bene? MVP

*Copia tutto quello che segue nel primo messaggio a Claude Code, dopo aver posizionato il pacchetto in `docs/` (vedi README). Il prompt è pensato per essere eseguito in sessioni successive, una fase per sessione: al secondo messaggio basta "Procedi con la Fase N".*

---

Sei l'agente di sviluppo di **vado bene?**, una PWA mobile-first. Prima di scrivere una riga di codice leggi, in quest'ordine: `CLAUDE.md`, `docs/PRODUCT-SPEC.md`, `docs/BRAND.md`, e apri `docs/prototype/vadobene-prototype.html` per capire il flusso e l'aspetto esatto che devi riprodurre. Il prototipo è la verità visiva: a parità di stato, l'app in produzione deve sembrare identica.

Il prodotto in una riga: fotografi il tuo outfit, dici per cosa; in cinque secondi un primo parere automatico; poi cinque persone vere che non ti conoscono rispondono in tre minuti, alla cieca. Per ricevere cinque risposte ne dai cinque.

Lavora **una fase alla volta**. Ogni fase termina con: i criteri di accettazione verificati (scrivi i test che li coprono, non descriverli), `pnpm lint && pnpm typecheck && pnpm test` verdi, un commit con messaggio `feat(phase-N): …`, e un riepilogo di 5 righe massimo con cosa hai fatto e cosa hai lasciato in `docs/DECISIONS.md`. Non iniziare la fase successiva finché non ti dico "Procedi con la Fase N+1".

Quando una scelta non è coperta dai documenti, prendi l'opzione più semplice che rispetti le regole non negoziabili, annotala in `docs/DECISIONS.md` e vai avanti. Non fermarti a chiedere per cose reversibili.

---

## Fase 0 — Scaffold e infrastruttura

Crea il progetto: Next.js 15 (App Router), TypeScript strict, Tailwind, pnpm. Aggiungi Supabase (client + server helpers), `@anthropic-ai/sdk`, Zod, Stripe, Resend, PostHog, Vitest, Playwright.

Config PWA: `manifest.json` con nome "vado bene?", short_name "vado bene?", theme_color `#0E2A36`, background_color `#0E2A36`, icone generate da `docs/brand/app-icon.svg` (192, 512, maskable). `<meta name="color-scheme" content="dark">`, `<meta name="theme-color">`.

Tailwind: estendi il tema con i token di `docs/BRAND.md` (colori, font families `display`/`logo`/`body`/`mono`). Carica i Google Fonts indicati con `next/font`.

Supabase: migrazione SQL con lo schema in `docs/PRODUCT-SPEC.md` §6.1, RLS su tutte le tabelle (un utente legge/scrive solo le proprie `requests`; `votes` scrivibili solo dal juror, leggibili dal proprietario della request; nessuno legge `users.email` degli altri). Bucket Storage privato `outfits`. Seed della tabella `occasions` con: Colloquio, Matrimonio, Primo appuntamento, Ufficio, Aperitivo, Cena con i suoceri, Laurea.

`src/lib/contracts.ts`: gli schemi Zod di §6.2, esportati e testati.

`.env.example` con tutte le variabili. README con i comandi.

**Accettazione:** `pnpm dev` parte; `/` mostra una pagina vuota col colore di sfondo giusto e il manifest valido (Lighthouse PWA installabile); migrazione applicata su Supabase locale; test dei contratti Zod verdi.

---

## Fase 1 — Landing + flusso "Chiedi" + primo parere AI

Riproduci in React il prototipo `docs/prototype/vadobene-prototype.html` per gli stadi 1→3 (input, scan, primo parere). Componenti in `src/components/`: `Brand` (logotipo + marchio SVG da `docs/brand/mark.svg`, con prop `size` e `color`), `Hero` (headline, specimen card inclinata con mini-thread, proof strip), `Flow` (contenitore a stadi con titolo che cambia), `PhotoDrop` (**div + input.click(), mai label**), `OccasionChips`, `ScanLines`, `ThreadSent`, `AiReply`.

Route handler `POST /api/verdict`: riceve `{ photo: base64, occasionSlug }`, ridimensiona server-side se > 1280px, chiama Anthropic (modello `claude-sonnet-4-5`, vision) con il prompt di sistema in §6.5, valida la risposta con `AiVerdict`, salva `requests` con `status='ai_done'`, restituisce il verdetto. Se `unsafe_content`, non salvare la foto e rispondi 422 con messaggio in voce brand ("Non vedo un outfit. Riprova con una foto a figura intera.").

Foto: ridimensiona client-side a max 1280px prima dell'invio. Nessun account richiesto per questo stadio: crea una sessione anonima Supabase.

**Accettazione:** su iPhone (Playwright, viewport 390×844, e test manuale su device) il tap sulla zona foto apre camera/galleria; il flusso foto → occasione → "Vado bene?" → scan → bolla del primo parere è visivamente identico al prototipo; il verdetto è validato da Zod; una foto senza outfit riceve il 422; screenshot Playwright di ogni stadio salvati in `e2e/screens/`.

---

## Fase 2 — Reciprocità: "Prima rispondi tu"

Stadio 4 del prototipo. Route `GET /api/queue/next`: restituisce la prossima `request` in `jury_open` da votare secondo §6.4 (escludi le proprie e quelle già votate; deadline più vicina prima; max 20 per sessione, tracciato server-side). Route `POST /api/vote`: `{ requestId, verdict, note? }` → moderazione della nota via Anthropic con `NoteModeration` (modello `claude-haiku-4-5`, temperatura 0) → salva il voto con `note_status` → incrementa `jury_credit` e `juror_score` → restituisce `{ credit }`.

UI: barra a cinque segmenti del credito, card outfit anonima (foto firmata da Storage con URL a scadenza breve), tre bottoni, nota facoltativa, messaggio se la nota è stata filtrata ("La riga parla della persona, non dell'outfit: non verrà mostrata. Il voto sì."). Al quinto voto, transizione automatica allo stadio 5.

Quando la coda è vuota (nessuna `jury_open` disponibile): mostra "Nessuno sta chiedendo in questo momento" e offri di attendere o di procedere comunque (in tal caso il credito mancante viene concesso ma la richiesta dell'utente riceverà voti AI dichiarati).

Magic link Supabase Auth richiesto **solo** prima di votare (l'anonimo può chiedere il primo parere, ma per votare e per il Giurì serve un'email).

**Accettazione:** un utente non può votare due volte la stessa richiesta (unique constraint + test); una nota con riferimenti al corpo viene marcata `filtered` (test con 10 esempi, in italiano, inclusi eufemismi); il credito sale di uno per voto; la coda non serve mai le proprie richieste; RLS impedisce di leggere voti altrui via client (test).

---

## Fase 3 — Le cinque persone in tempo reale

Stadi 5 e 6. Route `POST /api/jury/open`: verifica `jury_credit >= 5`, scala 5, imposta `status='jury_open'` e `jury_deadline_at = now() + 3 min`. Supabase Realtime sul canale della `request`: il chiedente vede le risposte arrivare senza polling.

Edge function / cron ogni 30s (`/api/cron/close-juries`, protetta da secret): chiude le `jury_open` con 5 voti o deadline scaduta; se mancano voti, genera i mancanti con Anthropic (stesso prompt del verdetto, ma per un singolo voto yes/tweak/no + nota breve), salvati con `is_ai = true`; poi calcola `JurySummary` (regole: yes≥3 → yes; no≥3 → no; altrimenti tweak; `top_tweak` = nota più frequente tra i tweak; `quote` = prima nota non filtrata), salva in `jury_summary`, `status='jury_closed'`.

UI: timer 3:00 che scende, barra a cinque segmenti, risposte numerate 1–5 che entrano con l'animazione `pop` del prototipo (l'unico momento animato), card finale identica a `#stage-final` del prototipo. Se ci sono voti AI, la headline lo dichiara ("3 persone + 2 AI") e la riga di footer cambia in "3 persone vere + 2 pareri automatici".

Condividi: genera la card come PNG server-side (Satori o `@vercel/og`, 1080×1350) con lo stesso layout, foto inclusa solo se `keep_photo`, e usa `navigator.share` con fallback a copia link. La card ha un permalink pubblico `/c/[id]` che mostra solo la card (mai la foto se non `keep_photo`) e un bottone "Chiedilo anche tu".

**Accettazione:** con 6 utenti simulati (Playwright multi-context) un Giurì si chiude con 5 voti umani in < 3 minuti e le risposte compaiono in tempo reale; con 1 utente solo, si chiude a 3:00 con voti AI dichiarati in UI; la PNG condivisa corrisponde al layout; `/c/[id]` non espone mai la foto senza `keep_photo`.

---

## Fase 4 — Privacy, retention minima, pagamenti

Cron `/api/cron/expire-photos` (ogni ora): cancella dallo Storage le foto delle `requests` con `created_at < now() - 24h` e `keep_photo = false`, poi `status='expired'`. Test che verifica la cancellazione effettiva.

Pagina `/me`: credito, juror_score, piano, "Cancella tutto" (elimina utente, richieste, voti, foto — hard delete).

Stripe Checkout per **Boost** (€0,99 una tantum → concede 5 di credito e apre subito il Giurì) e **Pro** (€3,99/mese, €29/anno → `plan='pro'`: Giurì senza credito, priorità in coda +1, `votes_target=10`). Webhook Stripe idempotente. Customer Portal per gestire l'abbonamento.

Resend: magic link con template in voce brand; email a chiusura Giurì ("Ecco. Sì, 4 su 5.") con link alla card.

PostHog: eventi `photo_added`, `occasion_selected`, `verdict_ai`, `jury_requested`, `vote_cast`, `jury_closed`, `card_shared`, `boost_purchased`, `pro_subscribed`. Funnel definito in `docs/ANALYTICS.md`.

**Accettazione:** foto sparite dallo Storage dopo 24h (test con clock mockato); "Cancella tutto" lascia zero righe per quell'utente; un Boost apre un Giurì senza credito; un Pro riceve 10 voti; webhook Stripe rifiuta firme non valide e ignora eventi duplicati.

---

## Fase 5 — Rifinitura e rilascio

Lighthouse mobile ≥ 90 su Performance, Accessibility, Best Practices, PWA. Focus visibile su tutti gli elementi interattivi, `prefers-reduced-motion` rispettato (nessuna animazione delle risposte, solo comparsa). Contrasto crema-su-blu e testi nelle bolle di risposta ≥ 4.5:1 (verifica con axe in Playwright).

Test end-to-end completo del flusso su iPhone 14 e Pixel 7 (Playwright device emulation) con screenshot per stadio confrontati con il prototipo (soglia pixel diff ≤ 2% sulle aree non dinamiche).

Deploy su Vercel (Hobby), Supabase (free), dominio `vadobene.app`. Iubenda privacy/cookie policy linkate nel footer. Pagina `/privacy` che spiega in voce brand: alla cieca, foto cancellate a 24h, nessun giudizio sul corpo.

Documenta in `docs/RUNBOOK.md`: variabili d'ambiente, cron, come ruotare le chiavi, come moderare manualmente (query per `note_status='flagged'`, come togliere `can_comment`).

**Accettazione:** URL di produzione funzionante; tutti i criteri delle fasi precedenti verdi in CI (GitHub Actions: lint, typecheck, test, e2e); runbook completo.

---

## Quando hai finito la Fase 0

Rispondi con: la struttura delle cartelle creata, l'output di `pnpm test`, e la frase "Fase 0 completata, pronto per la Fase 1". Non iniziare la Fase 1.
