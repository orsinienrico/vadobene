# vado bene? — CLAUDE.md

## Cos'è
PWA mobile-first, Next.js 15 App Router + TypeScript + Tailwind, Supabase (Postgres/Auth/Storage/Realtime), Anthropic API (vision, structured output), Stripe, Resend, PostHog. Un utente manda la foto di un outfit + occasione; riceve un primo parere AI e poi cinque voti umani alla cieca in tre minuti. Per ricevere cinque voti ne dà cinque.

## Fonti di verità (in ordine)
1. `docs/PRODUCT-SPEC.md` — regole di prodotto, schema, contratti, macchina a stati
2. `docs/BRAND.md` — colori, font, voce, marchio. Non inventare colori o font.
3. `docs/prototype/vadobene-prototype.html` — il riferimento visivo e di flusso. La UI in produzione deve essere indistinguibile da questo prototipo a parità di stato.
4. `docs/prototype/logo-system.html`, `docs/brand/mark.svg`, `docs/brand/app-icon.svg` — il marchio ufficiale

## Regole che non si discutono
- Nessun giudizio sul corpo, mai. Ogni nota utente passa dalla moderazione AI prima di essere mostrata.
- I voti AI di riempimento hanno `is_ai = true` e sono dichiarati in UI. Mai spacciati per umani.
- Foto in bucket privato, cancellate a 24h se `keep_photo = false`. Cron verificato con test.
- Nessun punteggio numerico sulla persona. Solo yes/tweak/no.
- La chiave Anthropic vive solo in route handler server-side. Mai nel client.
- Il bottone principale dice "Vado bene?". Il marchio "?" è sempre l'SVG ufficiale, mai il carattere tipografico.
- Colori verde/ambra/rosso compaiono solo dentro le risposte. Mai altrove.

## Stack e convenzioni
- `pnpm`. Node 20+.
- Componenti in `src/components/`, route handlers in `src/app/api/`, logica dominio in `src/lib/`.
- Validazione input e output AI con Zod (`src/lib/contracts.ts` è la fonte).
- Supabase client: `src/lib/supabase/{client,server}.ts`. RLS attivo su tutte le tabelle.
- Test: Vitest per la logica (`src/lib/**/*.test.ts`), Playwright per il flusso end-to-end su viewport iPhone 14 (390×844).
- Nessun `localStorage` per stato critico. Sessione via Supabase Auth.

## iOS Safari — trappole già incontrate
- Input file: usare un `<div role="button">` che chiama `input.click()` in JS. **Mai** `<label for="file">`: genera un box mal dimensionato su iOS.
- Nessun `transform: translateZ(0)` / `backface-visibility` come hack: peggiorano.
- `100svh` per l'hero, non `100vh`.
- `<meta name="color-scheme" content="dark">` + `<meta name="theme-color" content="#0E2A36">` + un `<div id="bgFill">` fisso con `z-index:-1` dietro tutto.
- Ridimensionare le foto client-side a max 1280px prima dell'upload.
- Niente `feTurbulence` SVG fullscreen, niente `requestAnimationFrame` che aggiorna stato al mount.

## Come lavorare
- Una fase alla volta (vedi `docs/IMPLEMENTATION-PROMPT.md`). Non passare alla successiva senza che i criteri di accettazione della corrente siano verdi.
- Prima di ogni PR: `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e`.
- Se una decisione non è coperta da spec/brand, scegli l'opzione più semplice, documentala in `docs/DECISIONS.md` con data e motivo, e vai avanti.
