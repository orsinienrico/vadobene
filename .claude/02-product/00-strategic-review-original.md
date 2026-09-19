# Fitwise 2.0 — Dal verdetto AI al Giurì umano

*Revisione strategica end-to-end + spec agent-ready. 13 settembre 2026.*

Nota di metodo: non ho potuto aprire il prototype su GitHub Pages, quindi la revisione dell'as-is si basa su ciò che so del prodotto (analizzatore di coerenza outfit–occasione, AI-only, statico su GitHub Pages, freemium già disegnato, slogan "Lo specchio che non mente"). Dove faccio ipotesi lo dico. Se mi passi il codice del prototype, la sezione 6 diventa un diff sul tuo repo invece di una spec da zero.

---

## 1. Revisione end-to-end dell'as-is

### Cosa funziona e va tenuto
- **La domanda giusta.** "Va bene *per questa occasione*?" è la vera domanda che la gente si fa davanti allo specchio. Non "sono bello", ma "sono adeguato". È un wedge più onesto e meno tossico del giudizio estetico puro, e taglia trasversalmente uomini/donne, 18/60 anni.
- **Lo slogan.** "Lo specchio che non mente" è un asset: promette verità, non lusinga. Va tenuto e diventa più vero, non meno, con persone reali dietro lo specchio.
- **Il lavoro già fatto** su pricing, brand e architettura: non si butta, si riorienta.

### Dove è debole (in ordine di gravità)

1. **Zero moat.** Foto + "va bene per un matrimonio?" a Claude o ChatGPT dà lo stesso risultato. Chiunque può clonare Fitwise in un pomeriggio, e l'utente stesso può bypassarlo. Questa è la falla che hai identificato tu, ed è fatale per un business, non per un giocattolo.

2. **Retention episodica.** Le occasioni che generano ansia (matrimonio, colloquio, primo appuntamento) capitano poche volte l'anno. Un'app che usi 4 volte l'anno non regge un abbonamento e non costruisce abitudine.

3. **Fiducia nel verdetto.** Un giudizio AI su gusto e contesto sociale è opinabile per definizione; l'utente lo sconta ("è un algoritmo"). Il verdetto di 5 persone reali, alla cieca, non si sconta: è il mondo che ti risponde.

4. **Il nome.** "Fitwise" è già occupato da un calorie tracker su App Store (fitwise.io, MAVELLI FZCO) e da almeno tre repo fitness su GitHub. Nel momento in cui cerchi trazione, l'ASO e il dominio ti remano contro e c'è rischio di contestazione. Va cambiato prima del lancio, tenendo lo slogan. Proposte a fine documento.

5. **Architettura statica.** GitHub Pages non permette account, coda di votanti, realtime, pagamenti. Va bene per il demo AI-only; per il Giurì serve un backend, anche minimo.

6. **Monetizzazione di un wrapper.** Nessuno paga per un verdetto AI che ha già gratis nella chat che usa ogni giorno. Si paga per accesso a persone, priorità, e archivio.

### Il principio della trasformazione
**L'AI resta, ma cambia ruolo:** da giudice a *hook* (verdetto istantaneo nei primi 5 secondi, così il prodotto è vivo dal primo utente) e da giudice a *sintetizzatore* (raccoglie i voti umani, li rende leggibili, filtra le cattiverie). Il prodotto vero è il **Giurì**: cinque persone reali che ti dicono in 3 minuti, alla cieca, se funziona.

---

## 2. Fitwise 2.0 — Il prodotto

### Promessa
*"Fotografa. Dì per cosa. In tre minuti cinque persone vere ti dicono se funziona — e non sanno chi sei."*

### I tre loop, uno dentro l'altro

**Loop 1 — Il verdetto (chi chiede).**
Foto + occasione → verdetto AI immediato (Sì / Sì con una modifica / No, e la modifica) → "Chiedi al Giurì" → in 3 minuti arrivano 5 voti umani alla cieca → card finale: percentuale, la modifica più suggerita, una frase che resta. Condividi la card.

**Loop 2 — Il giudizio (chi vota).** Questo è il motore quotidiano, e la parte che nessun chatbot può replicare.
Feed di outfit anonimi con la loro occasione. Per ognuno: tre tap (Sì / Con una modifica / No) + una riga opzionale. È ipnotico come uno swipe ma con una decisione tua a ogni foto. Chi vota accumula "credito Giurì" e reputazione da giurato.

**Loop 3 — La reciprocità (il cold start).**
Per ricevere 5 voti devi averne dati 5. Nessun pool da riscaldare: la prima persona che chiede sta già dando. Quando il pool è vuoto (le 7 del mattino del giorno 1), l'AI copre con un "Giurì AI" *dichiarato come tale*, mai spacciato per umano — la fiducia è l'asset e non si baratta.

### Regole di prodotto (non negoziabili)
- **Alla cieca.** Chi vota non vede nome, profilo, follower. Chi chiede non vede chi ha votato. Rimuove il social-status e rende il voto onesto.
- **Si giudica l'outfit per l'occasione, mai il corpo.** Le righe libere passano da un filtro AI che scarta commenti su fisico, età, etnia. Un giurato segnalato due volte perde il diritto di scrivere, tiene il voto.
- **Nessun punteggio numerico sulla persona.** Solo: funziona / funziona con una modifica / non funziona. Il numero è la percentuale del Giurì, non un voto a te.
- **Foto cancellate dopo 24h** salvo l'utente scelga di tenerle nel proprio armadio. Coerente con "chiede cose che l'utente vuole dare".
- **Occasione obbligatoria.** Senza occasione non c'è domanda; è ciò che distingue Fitwise da "vota il mio look".

### Perché adesso è difendibile
- Test 1 (seconda persona): sì, strutturalmente.
- Test 3 (si accumula): reputazione da giurato, storico dei propri verdetti, e — a scala — un dataset unico al mondo di *cosa le persone reali considerano adeguato per quale occasione, per città e stagione*. Quello nessun modello ce l'ha.

---

## 3. Target e posizionamento

- **Chi chiede:** 20–45, momento di ansia pre-uscita. Trigger: colloquio, matrimonio, cerimonia, appuntamento, evento di lavoro, foto profilo.
- **Chi vota:** chiunque abbia due minuti morti. Il votante non è un sotto-prodotto: è l'utente più frequente e va trattato come tale (onboarding, reputazione, piccoli riconoscimenti).
- **Posizionamento:** non un'app di moda, un'app di *decisioni*. "Non ti diciamo cosa è bello. Ti diciamo se funziona."
- **Beachhead:** Italia, un'università + un ufficio grande per città (Pisa è perfetta: studenti = votanti, professionisti = chiedenti).

---

## 4. MVP — Solo questo, niente altro

1. **Chiedi:** foto (camera o galleria), occasione da lista (8 voci + libera), invio.
2. **Verdetto AI istantaneo** con una modifica suggerita.
3. **Giurì umano:** 5 voti alla cieca in coda realtime, timeout 3 minuti, poi completamento AI dichiarato.
4. **Feed di voto:** carte anonime, 3 tap + riga opzionale, contatore credito.
5. **Card finale** condivisibile (immagine con occasione, percentuale, frase) — la foto dell'utente compare solo se lui lo sceglie.
6. **Reciprocità:** contatore "hai 3 voti da dare per sbloccare il tuo Giurì".
7. **Moderazione AI** sulle righe libere.
8. **Account:** magic link, solo dopo il primo verdetto AI, obbligatorio per il Giurì.

Fuori dall'MVP: armadio, storico, inviti amici come giurati "esperti", chat, app native, badge oltre il contatore, qualsiasi cosa social (follow, like).

---

## 5. User journey

**Chi chiede (Marta, colloquio alle 10):**
1. Apre il link, foto, sceglie "Colloquio". 5 secondi: "Funziona. Una modifica: le scarpe sono troppo informali per un colloquio in banca."
2. "Vuoi il parere di 5 persone vere? Dai 5 voti e parte." Vota 5 outfit in 60 secondi.
3. Barra: 1/5… 5/5 in 2'40". Card: "4 su 5 dicono che funziona. La modifica più votata: le scarpe. Un giurato: *sembri già assunta, tranne ai piedi.*"
4. Cambia scarpe. Condivide la card alla sorella (senza foto). La sorella chiede il suo Giurì per stasera.

**Chi vota (Luca, in coda alla mensa):**
1. Apre, feed: foto + "Matrimonio in campagna, ottobre". Tap "Con una modifica", scrive "cravatta più scura".
2. Altri 12 in 3 minuti. "Oggi hai aiutato 13 persone a decidere. Sei tra i giurati più attivi di Pisa."
3. Domani torna, perché votare è più facile che scrollare e dà potere.

---

## 6. Spec agent-ready per Claude Code

### Stack (zero costi fissi)
- Next.js 15 App Router + TypeScript + Tailwind, PWA (camera via `<input capture>`). Vercel Hobby.
- Supabase: Postgres, Auth magic link, Storage (bucket privato, TTL 24h via cron), **Realtime** per la coda voti.
- Anthropic API (Sonnet, vision, structured output con Zod) per verdetto AI, sintesi, moderazione.
- Stripe Checkout (Pro), Resend (magic link), PostHog (funnel).
- Migrazione dal prototype statico: la UI del verdetto AI e il brand si portano; tutto il resto è nuovo.

### Modello dati (Postgres)
```
users(id, email, created_at, plan['free','pro'], jury_credit int default 0, juror_score int default 0, can_comment bool default true)
occasions(id, slug, label_it, label_en, is_custom bool)
requests(id, user_id, occasion_id, custom_occasion text, photo_path, status['ai_done','jury_open','jury_closed','expired'], ai_verdict jsonb, jury_summary jsonb, created_at, jury_deadline_at, votes_target int default 5, keep_photo bool default false)
votes(id, request_id, juror_id, verdict['yes','tweak','no'], note text, note_status['ok','filtered','flagged'], created_at, UNIQUE(request_id, juror_id))
reports(id, vote_id, reporter_id, reason, created_at)
```

### Contratti AI (Zod)
```ts
AiVerdict = { verdict: 'yes'|'tweak'|'no', tweak: string|null, one_liner: string, confidence: 'low'|'med'|'high', unsafe_content: boolean }
JurySummary = { yes:number, tweak:number, no:number, top_tweak:string|null, quote:string|null, headline:string }
NoteModeration = { status:'ok'|'filtered', reason?: 'body'|'age'|'ethnicity'|'insult'|'other' }
```
Prompt di sistema del verdetto: giudica *coerenza outfit–occasione*, mai il corpo; suggerisci una sola modifica concreta; tono diretto, mai crudele; se la foto non contiene un outfit riconoscibile → `unsafe_content` o richiesta nuova foto.

### Macchina a stati della richiesta
```
created → [AI verdict] → ai_done
ai_done → (user has credit ≥ 5 AND taps "Chiedi al Giurì") → jury_open (deadline = now+3min)
jury_open → (votes == 5) → jury_closed → [AI summary]
jury_open → (deadline passed) → fill remaining with AI votes flagged is_ai=true → jury_closed → [AI summary, headline dichiara "3 umani + 2 AI"]
ai_done → (24h, keep_photo=false) → expired, photo deleted
```

### Matching della coda
- Il feed di voto serve richieste in `jury_open` ordinate per deadline più vicina, escludendo le proprie e quelle già votate.
- Peso: richieste con meno voti prima; utenti Pro con priorità +1 posizione.
- Un giurato riceve al massimo 20 carte per sessione (evita voto compulsivo di bassa qualità).
- Ogni voto valido: `jury_credit += 1`, `juror_score += 1` (+1 extra se la sua modifica coincide con `top_tweak` finale — premia la qualità, non il volume).

### Realtime
- Canale Supabase per `requests.id`: il chiedente vede la barra 0/5 → 5/5 senza polling.
- Edge function/cron ogni 30s: chiude le richieste scadute e lancia il fill AI.

### Schermate (mobile-first, 5 in tutto)
1. `/` — Hero + bottone "Fotografa" + esempio di card. Nessun login.
2. `/ask` — foto, occasione, invio; poi il verdetto AI in-page con CTA Giurì.
3. `/jury/[id]` — barra realtime, poi card finale + "Condividi" + "Tieni la foto".
4. `/vote` — feed a carte, tre bottoni grandi, campo riga, contatore credito in alto.
5. `/me` — credito, score giurato, piano, "cancella tutto".

### Vincoli tecnici già noti dai tuoi prototipi
- iOS Safari: niente `feTurbulence` fullscreen, niente `requestAnimationFrame` che aggiorna stato al mount; `100dvh`, non `100vh`.
- Immagini: ridimensiona client-side a max 1280px prima dell'upload (peso e privacy).
- Nessun `localStorage` per stato critico; sessione via Supabase.

### Definition of Done dell'MVP
- Un utente nuovo ottiene un verdetto AI in < 8 s senza login.
- Con 6 utenti simultanei in test, un Giurì si chiude con 5 voti umani in < 3 minuti.
- Con 1 utente solo, il Giurì si chiude comunque in 3 minuti con etichetta "Giurì AI" visibile.
- Una riga con commento sul corpo viene filtrata prima di essere mostrata.
- Foto non conservate sparite dallo Storage dopo 24h (verificato).

---

## 7. Monetizzazione

- **Free:** verdetto AI illimitato; Giurì umano illimitato *ma* pagato in voti (5 dati : 1 ricevuto).
- **Pro — €3,99/mese o €29/anno:** Giurì senza dover votare (per chi ha fretta), priorità in coda, Giurì da 10 invece di 5, archivio armadio con storico dei verdetti, card senza watermark.
- **Boost — €0,99 una tantum:** "Giurì ora" per chi non ha credito ed è free. È il momento dell'ansia: converte.
- **Più avanti, non ora:** Giurì di amici invitati (gratis, cresce la rete); Giurì "esperti" (stylist verificati, a pagamento, revenue share); dati aggregati anonimi per brand ("cosa considerano adeguato i 25–34 per un colloquio in Italia") — è l'asset difendibile, ma serve scala.

Ipotesi unit economics: costo AI ~€0,01 per verdetto, ~€0,005 per moderazione riga; conversione Boost 5–8% dei Giurì free richiesti senza credito; Pro 2–3% degli attivi mensili.

---

## 8. Validazione prima del build (10 giorni)

1. **Giorni 1–5, test WhatsApp.** Un gruppo di 30 persone (mix studenti/professionisti). Chi vuole manda foto + occasione a te; tu la inoltri anonimizzata al gruppo; il gruppo risponde con Sì/Modifica/No + riga; tu sintetizzi. Misuri: quante richieste arrivano spontaneamente dal giorno 2, tempo medio a 5 risposte, quante persone rispondono senza che tu solleciti, tono delle righe.
2. **Kill criteria:** meno di 15 richieste spontanee in 5 giorni, o tempo medio a 5 voti > 20 minuti con 30 persone, o > 20% di righe da filtrare. Se scatta uno di questi, il Giurì non regge e Fitwise resta un demo.
3. **Giorni 6–10, fake door.** Landing con la card d'esempio, "Chiedi al Giurì" → waitlist. 300 visite da gruppi universitari e LinkedIn locale. CTA > 8% → build.

---

## 9. Piano di lancio

1. **Settimana 1:** nuovo nome e dominio (vedi sotto). Setup Vercel/Supabase/Stripe/PostHog. Test WhatsApp in parallelo.
2. **Settimana 2:** build con Claude Code dalla spec in §6. Porta il brand e il verdetto AI dal prototype attuale.
3. **Settimana 3:** beta chiusa con i 30 del test + i loro inviti. Obiettivo: 100 giurati attivi in una città. Il Giurì funziona solo se in una stessa fascia oraria ci sono 20+ votanti; **concentra, non disperdere** — una città, due luoghi, orari di picco (8–9, 13–14, 19–21).
4. **Settimana 4:** lancio pubblico locale: cartelli in ateneo con QR e una card vera, post nei gruppi studenteschi, un evento (aperitivo "il Giurì dal vivo"). Niente Product Hunt finché il loop non regge da solo in una città.
5. **Giorno 30, metriche che giustificano continuare:** ≥ 60% dei Giurì chiusi da soli umani nelle fasce di picco; ≥ 40% dei votanti torna il giorno dopo; ≥ 3% conversione Boost; NPS dei chiedenti ≥ 40.
6. **Poi:** seconda città, Giurì di amici, armadio. Non prima.

---

## 10. Nome

Fitwise va cambiato per il conflitto di marchio. Vincoli: italiano o pronunciabile in italiano, coerente con "Lo specchio che non mente", dominio .it o .app libero, dice "persone" non "AI". Tre direzioni, da verificare:

- **Giurì** — è già il nome del meccanismo; brand = prodotto. Rischio: parola legale, seria.
- **Verdetto** — diretto, feroce, screenshot-friendly ("Verdetto: funziona").
- **Cinque** — il numero dei giurati come identità; leggero, memorabile, neutro.

Il mio ordine: Verdetto, Cinque, Giurì. Ma qui vale il tuo filtro, non il mio.

---

*In una riga: Fitwise diventa difendibile il giorno in cui dietro lo specchio ci sono cinque persone e non un modello. L'AI apre la porta e mette ordine; il valore lo danno gli altri.*
