# vado bene? — Pacchetto MVP

*19 settembre 2026. Tutto ciò che serve per passare da prototipo a prodotto.*

## Contenuto

```
vadobene-package/
├── README.md                          ← questo file
├── 01-brand/
│   ├── BRAND.md                       ← brand book ufficiale (nome, marchio, colori, font, voce, card)
│   ├── mark.svg                       ← il marchio "?" a cinque punti, un colore (currentColor)
│   ├── app-icon.svg                   ← icona app 512×512 su gradiente blu
│   ├── logo-system.html               ← sistema logo completo con versione animata
│   └── direction-board.html           ← tavola di direzione UX (modello "messaggio nel gruppo")
├── 02-product/
│   ├── PRODUCT-SPEC.md                ← spec consolidata: regole, UX a stadi, schema DB, contratti Zod, stati, pricing, metriche
│   └── 00-strategic-review-original.md← revisione strategica di partenza (contesto, dove diverge vale PRODUCT-SPEC)
├── 03-prototype/
│   ├── vadobene-prototype.html        ← IL riferimento visivo e di flusso (ex MVPdemo6). Aprilo su iPhone.
│   └── archive-MVPdemo1-dark-gold.html← versione precedente (nero/oro), solo per confronto
└── 04-claude-code/
    ├── CLAUDE.md                      ← da mettere alla radice del repo
    └── IMPLEMENTATION-PROMPT.md       ← il prompt in 6 fasi da dare a Claude Code
```

## Come usarlo con Claude Code

1. Crea il repo vuoto: `mkdir vadobene && cd vadobene && git init`
2. Copia `04-claude-code/CLAUDE.md` alla radice del repo.
3. Crea `docs/` e copia dentro:
   - `02-product/PRODUCT-SPEC.md` → `docs/PRODUCT-SPEC.md`
   - `01-brand/BRAND.md` → `docs/BRAND.md`
   - `01-brand/mark.svg`, `01-brand/app-icon.svg` → `docs/brand/`
   - `03-prototype/vadobene-prototype.html`, `01-brand/logo-system.html` → `docs/prototype/`
   - `04-claude-code/IMPLEMENTATION-PROMPT.md` → `docs/IMPLEMENTATION-PROMPT.md`
4. Apri Claude Code nel repo e incolla il contenuto di `IMPLEMENTATION-PROMPT.md` come primo messaggio.
5. L'agente esegue la **Fase 0** e si ferma. Verifica, poi "Procedi con la Fase 1", e così via.

Ogni fase ha criteri di accettazione con test: non accettare "fatto" senza vedere i test verdi.

## Stack (zero costi fissi)

Next.js 15 + TypeScript + Tailwind su Vercel Hobby · Supabase free (Postgres, Auth magic link, Storage privato, Realtime) · Anthropic API (Sonnet per verdetto/vision, Haiku per moderazione) · Stripe (Boost €0,99 / Pro €3,99) · Resend · PostHog · Vitest + Playwright. Unico costo iniziale: il dominio.

## Prima del build: validazione (non saltarla)

Test WhatsApp, 5 giorni, 30 persone (mix studenti/professionisti a Pisa): chi vuole manda foto + occasione a te, tu la inoltri anonimizzata al gruppo, il gruppo risponde Sì/Modifica/No + riga, tu sintetizzi.

Kill criteria, decisi ora: meno di 15 richieste spontanee; tempo medio a 5 risposte > 20 minuti; più del 20% di righe da filtrare. Uno solo che scatta → il Giurì non regge da solo e il prodotto resta un demo AI.

## Cose ancora da fare fuori dal codice

- Registrare `vadobene.app` / `vadobene.it` e `@vadobene` (Instagram, TikTok)
- Verifica EUIPO classi 9 e 42 prima del deposito del marchio (il nome è una frase comune: la tutela sta nel "?" a cinque punti e nel payoff)
- Account: Vercel, Supabase, Anthropic, Stripe, Resend, PostHog, Iubenda
