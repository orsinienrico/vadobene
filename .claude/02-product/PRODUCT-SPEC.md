# vado bene? — Product Specification (v1.0)

*Consolida le decisioni prese tra il 13 e il 19 settembre 2026. La revisione strategica originale (`00-strategic-review-original.md`) resta come contesto; dove i due documenti divergono, vale questo.*

---

## 1. Il prodotto in tre righe

Fotografi il tuo outfit, dici per cosa. In cinque secondi un primo parere automatico. Se vuoi la verità intera, cinque persone vere che non ti conoscono ti rispondono in tre minuti, alla cieca. Per ricevere cinque risposte, ne dai cinque.

## 2. Perché è difendibile

La versione solo-AI (Fitwise) è replicabile aprendo Claude con una foto. Il valore difendibile è:
1. **La seconda persona** — cinque voti umani non si ottengono da un chatbot.
2. **La reciprocità** — risolve il cold start: il primo utente che chiede sta già dando.
3. **Il dataset** — a scala, cosa le persone reali considerano adeguato per quale occasione, per città e stagione. Nessun modello ce l'ha.

L'AI resta ma cambia ruolo: da giudice a *hook* (primo parere istantaneo, così il prodotto vive dal primo utente) e a *sintetizzatore/moderatore*.

## 3. Regole di prodotto (non negoziabili)

- **Alla cieca.** Chi vota non vede nome, profilo, follower di chi chiede. Chi chiede non vede chi ha votato.
- **Si giudica l'outfit per l'occasione, mai il corpo.** Le note libere passano da moderazione AI che scarta riferimenti a fisico, peso, età, etnia. Un giurato segnalato due volte perde il diritto di scrivere note; conserva il voto.
- **Nessun punteggio numerico sulla persona.** Solo: Funziona / Con una modifica / No. Il numero è "N su 5", mai un voto a te.
- **Foto cancellate dopo 24h** salvo l'utente scelga di tenerle.
- **Occasione obbligatoria.** Senza occasione non c'è domanda.
- **L'AI è sempre dichiarata.** Quando il pool umano è vuoto e scade il timer, i voti mancanti sono generati dall'AI ed **etichettati come tali** ("3 persone + 2 AI"). Mai spacciati per umani.

## 4. Target

- **Chi chiede:** 20–45, momento di ansia pre-uscita. Trigger: colloquio, matrimonio, cerimonia, primo appuntamento, evento di lavoro, cena con i suoceri, laurea.
- **Chi vota:** chiunque abbia due minuti morti. È l'utente più frequente e va trattato come tale.
- **Beachhead:** una città, due luoghi (ateneo + un ufficio grande), orari di picco (8–9, 13–14, 19–21). Pisa. Il Giurì funziona solo con 20+ votanti nella stessa fascia oraria: concentrare, non disperdere.

## 5. UX: il modello "messaggio nel gruppo"

Il prodotto è una **landing a pagina singola** (hero + flusso), non un'app con navigazione. Il flusso, una volta partito, è disegnato come **thread di messaggi**:

| Stadio | Cosa vede l'utente | Riferimento nel prototipo |
|---|---|---|
| 1. Chiedi | Zona foto + chip occasione + bottone "Vado bene?" | `#stage-input` |
| 2. Scan | 4 righe mono che si accendono in sequenza (~2.5s) | `#stage-scan` |
| 3. Inviato + primo parere | La foto come messaggio inviato ("Vado bene? Colloquio."), sotto la bolla AI etichettata "Primo parere · automatico" con Sì/Sì con modifica/No, la modifica suggerita, una frase. Poi la riga di sistema "Questo è un algoritmo · quello che conta arriva dalle persone" e il bottone "Chiedi a cinque persone vere" | `#stage-ai` |
| 4. Prima rispondi tu | Se credito < 5: spiegazione + barra 5 segmenti + card outfit anonimo da votare (Funziona / Modifica / No + nota facoltativa). Ripete finché credito = 5 | `#stage-gate` |
| 5. Stanno guardando | Timer 3:00, barra a 5 segmenti, le risposte entrano una alla volta come messaggi numerati 1–5, colorati dal verdetto, con nota se presente | `#stage-jury` |
| 6. Ecco | Card finale: marchio + occasione, headline ("Sì. 4 su 5."), cinque punti colorati, riga di sintesi, modifica più votata, una citazione, footer mono. Bottoni Condividi / Nuovo look | `#stage-final` |

Il titolo del flusso cambia con lo stadio: "Il tuo riflesso" → "Inviato" → "Prima rispondi tu" → "Stanno guardando" → "Ecco."

**Hero:** headline Fraunces 300 grande con chiusa in corsivo; card-specimen inclinata 2.5° con ombra profonda e bagliore radiale, che contiene un mini-thread (foto inviata, tre risposte, headline "Sì. 4 su 5.").

**Un solo momento animato in tutto il prodotto:** le cinque risposte che entrano una dopo l'altra. Lo scan è la sua anteprima.

## 6. Contratti dati

### 6.1 Schema (Postgres)
```sql
users(id uuid pk, email text unique, created_at timestamptz, plan text check (plan in ('free','pro')) default 'free',
      jury_credit int default 0, juror_score int default 0, can_comment bool default true)

occasions(id serial pk, slug text unique, label_it text, label_en text, is_custom bool default false)

requests(id uuid pk, user_id uuid fk, occasion_id int fk, custom_occasion text,
         photo_path text, status text check (status in ('ai_done','jury_open','jury_closed','expired')),
         ai_verdict jsonb, jury_summary jsonb, created_at timestamptz, jury_deadline_at timestamptz,
         votes_target int default 5, keep_photo bool default false)

votes(id uuid pk, request_id uuid fk, juror_id uuid fk, verdict text check (verdict in ('yes','tweak','no')),
      note text, note_status text check (note_status in ('ok','filtered','flagged')) default 'ok',
      is_ai bool default false, created_at timestamptz, unique(request_id, juror_id))

reports(id uuid pk, vote_id uuid fk, reporter_id uuid fk, reason text, created_at timestamptz)
```

### 6.2 Contratti AI (Zod)
```ts
const AiVerdict = z.object({
  verdict: z.enum(['yes','tweak','no']),
  tweak: z.string().nullable(),          // una sola modifica concreta, o null
  one_liner: z.string().max(90),         // la frase che resta
  confidence: z.enum(['low','med','high']),
  unsafe_content: z.boolean(),           // foto senza outfit riconoscibile, nudità, minori
});

const JurySummary = z.object({
  yes: z.number().int(), tweak: z.number().int(), no: z.number().int(),
  human_votes: z.number().int(), ai_votes: z.number().int(),
  result: z.enum(['yes','tweak','no']), // yes>=3 → yes; no>=3 → no; altrimenti tweak
  top_tweak: z.string().nullable(),
  quote: z.string().nullable(),
  headline: z.string(),                  // "Sì. 4 su 5." / "Sì, con una modifica." / "No. 3 su 5."
});

const NoteModeration = z.object({
  status: z.enum(['ok','filtered']),
  reason: z.enum(['body','age','ethnicity','insult','other']).optional(),
});
```

### 6.3 Macchina a stati della richiesta
```
created → [AI verdict] → ai_done
ai_done → (user.jury_credit >= 5 AND "Chiedi a cinque persone") → jury_open (deadline = now + 3 min; credit -= 5)
jury_open → (5 voti umani) → jury_closed → [AI summary]
jury_open → (deadline scaduta) → fill con voti AI (is_ai=true) → jury_closed → [AI summary con headline che dichiara il mix]
ai_done → (24h, keep_photo=false) → expired, foto cancellata dallo storage
```

### 6.4 Matching della coda di voto
- Serve richieste in `jury_open` ordinate per deadline più vicina, escludendo le proprie e quelle già votate dall'utente.
- Peso: richieste con meno voti prima; utenti Pro +1 posizione.
- Max 20 carte per sessione di voto (evita voto compulsivo).
- Ogni voto valido: `jury_credit += 1`, `juror_score += 1` (+1 extra se la sua modifica coincide con `top_tweak` finale).

### 6.5 Prompt di sistema per il verdetto AI (bozza)
> Sei un parere onesto sull'adeguatezza di un outfit per un'occasione. Giudichi *coerenza tra outfit e occasione*, mai il corpo, il peso, l'età o l'aspetto della persona. Rispondi con un solo verdetto tra: funziona / funziona con una modifica / non funziona. Se suggerisci una modifica, è una sola, concreta, eseguibile in un minuto (cambia le scarpe, togli la giacca). Chiudi con una frase breve, diretta, che resta in mente; mai crudele, mai entusiasta. Se la foto non contiene un outfit riconoscibile, o contiene nudità o minori, imposta unsafe_content = true e non dare verdetto.

## 7. Monetizzazione

| Piano | Prezzo | Cosa include |
|---|---|---|
| Free | — | Primo parere AI illimitato; cinque persone illimitate ma pagate in voti (5 dati : 1 ricevuto) |
| Boost | €0,99 una tantum | "Cinque persone ora" senza dover votare. Il momento dell'ansia converte. |
| Pro | €3,99/mese · €29/anno | Senza dover votare, priorità in coda, 10 persone invece di 5, archivio armadio, card senza watermark |

Non nell'MVP: cinque persone scelte tra amici invitati (gratis, cresce la rete), giurati "esperti" verificati (revenue share), dati aggregati per brand.

## 8. Metriche e validazione

**Prima del build (test WhatsApp, 5 giorni, 30 persone):** ≥15 richieste spontanee; tempo medio a 5 risposte < 20 min; < 20% di note da filtrare. Un solo kill criterion scattato → il Giurì non regge, resta demo.

**Dopo 30 giorni di beta in una città:** ≥60% dei Giurì chiusi da soli umani nelle fasce di picco; ≥40% dei votanti torna il giorno dopo; ≥3% conversione Boost; NPS chiedenti ≥40.

## 9. Fuori dall'MVP
Armadio/storico, inviti amici, chat, app native, badge oltre il contatore, qualsiasi cosa social (follow, like), occasioni personalizzate libere (la lista fissa basta).
