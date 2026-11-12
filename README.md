# vado bene?

> **Release management (2026-11-12):** see [docs/RELEASE-OPERATIONS.md](docs/RELEASE-OPERATIONS.md) for the live Vercel/Git workflow, database migration order, and blockers before launch.

PWA mobile-first: fotografi il tuo outfit, dici per cosa; in cinque secondi un primo parere automatico; poi cinque persone vere che non ti conoscono rispondono in tre minuti, alla cieca. Per ricevere cinque voti ne dà cinque.

> Docs di riferimento: [docs/PRODUCT-SPEC.md](docs/PRODUCT-SPEC.md), [docs/BRAND.md](docs/BRAND.md), [docs/prototype/vadobene-prototype.html](docs/prototype/vadobene-prototype.html). Regole di lavoro in [CLAUDE.md](CLAUDE.md).

## Comandi

```bash
pnpm install          # setup
pnpm dev              # dev server → http://localhost:3000
pnpm lint             # ESLint
pnpm typecheck        # TypeScript strict
pnpm test             # Vitest (logica in src/lib)
pnpm e2e              # Playwright (viewport iPhone 14 390×844)
pnpm build            # build produzione

node scripts/generate-icons.mjs   # rigenera le icone PWA da docs/brand/app-icon.svg

# DB (serve psql e SUPABASE_DB_URL in .env)
psql "$SUPABASE_DB_URL" -f supabase/migrations/0001_init.sql
```

## Setup locale

1. Copia `.env.example` → `.env.local` e riempi le variabili (Supabase, Anthropic, Stripe, Resend, PostHog).
2. Applica la migrazione: `supabase/migrations/0001_init.sql` (schema §6.1, RLS, seed occasioni, bucket `outfits` privato).
3. `pnpm dev` e apri su viewport mobile (iPhone 14: 390×844).

## Struttura

```
src/
├── app/            # App Router: pagine e route handler (/api)
├── components/     # componenti React (Brand, Flow, PhotoDrop, …)
└── lib/
    ├── contracts.ts      # schemi Zod — fonte di verità contratti AI
    └── supabase/         # client.ts (browser), server.ts (SSR + admin)
supabase/migrations/     # SQL versionato
e2e/                     # test Playwright + screenshot per stadio
docs/                    # spec, brand, prototipo, decisioni
```

## Regole non negoziabili (TL;DR)

- Mai giudizi sul corpo. Ogni nota passa da moderazione AI.
- I voti AI sono `is_ai = true` e dichiarati in UI.
- Foto in bucket privato, cancellate a 24h se `keep_photo = false`.
- Solo yes/tweak/no. Nessun punteggio sulla persona.
- Verde/ambra/rosso solo dentro le risposte.
- Il bottone principale dice "Vado bene?".
