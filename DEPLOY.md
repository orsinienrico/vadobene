# DEPLOY — vado bene?

> **Operational update (2026-11-12):** [docs/RELEASE-OPERATIONS.md](docs/RELEASE-OPERATIONS.md) supersedes the older Vercel CLI workflow and Hobby cron guidance below. The deployment workflow is now Docker fallback only.

Checklist di rilascio: Vercel (primary) + Docker (self-host/replicabile). Ultimo aggiornamento: 2026-09-26.

---

## 1. Prerequisiti

| Cosa | Dove |
|---|---|
| Progetto Vercel collegato al repo | `npx vercel login` → `npx vercel link` (crea `.vercel/project.json`, NON committarlo) |
| Supabase project (EU) | supabase.com → Settings → API / Database |
| GHCR abilitato sul repo | GitHub → Packages: la prima push dell'immagine lo crea (visibility: private di default) |
| Node 20+ e pnpm (campo `packageManager`) | locale; in CI/Docker li installa corepack/action-setup |

## 2. Variabili d'ambiente

Server-only = MAI con prefisso `NEXT_PUBLIC_`, vive solo server-side. `NEXT_PUBLIC_*` = inlineate nel bundle client a build time (nelle immagini Docker vanno passate come build-args).

| Variabile | Tipo | Dove si usa |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | NEXT_PUBLIC | client + server (Supabase → Settings → API) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | NEXT_PUBLIC | client + server (RLS protegge) |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only | route admin/cron (bypassa RLS) |
| `SUPABASE_DB_URL` | server-only | solo migrazioni (`pnpm db:migrate`) |
| `ANTHROPIC_API_KEY` | server-only | `/api/verdict`, cron close-juries (vision + moderazione) |
| `STRIPE_SECRET_KEY` | server-only | checkout boost/pro |
| `STRIPE_WEBHOOK_SECRET` | server-only | webhook Stripe |
| `STRIPE_PRICE_BOOST` / `STRIPE_PRICE_PRO_MONTHLY` / `STRIPE_PRICE_PRO_YEARLY` | server-only | route checkout |
| `RESEND_API_KEY` | server-only | email (verdetto, chiusura giurì) |
| `RESEND_FROM` | server-only | email |
| `CRON_SECRET` | server-only | `/api/cron/*` (Vercel Cron manda Bearer; sidecar compose usa `?secret=`) |
| `JURY_DURATION_SECONDS` | server-only | durata timer giurì (default 180; utile in test) |
| `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` | NEXT_PUBLIC | analytics client (caricato solo se presente) |
| `NEXT_PUBLIC_SITE_URL` | NEXT_PUBLIC | URL assoluto card/email |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | — | **non usata dal codice** (checkout via redirect server-side): non configurare |

## 3. Vercel (primary)

1. **Link**: `npx vercel login` → `npx vercel link` (una tantum, crea `.vercel/project.json`).
2. **Env vars**: dashboard → Settings → Environment Variables (Production + Preview), oppure CLI:
   ```bash
   npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
   npx vercel env add ANTHROPIC_API_KEY production
   # ... tutte le variabili della tabella §2 tranne quelle NON usate
   ```
3. **Region**: `vercel.json` ha `"regions": ["fra1"]` (Supabase/PostHog EU — latenza DB minima).
4. **Cron**: `vercel.json` ha `close-juries` (`0 * * * *`) e `expire-photos` (`30 * * * *`) — il minimo che Hobby concede (1/ora ciascuno).
   - **Attenzione (Hobby)**: i cron Hobby girano max 1/ora. Il giurì a 3 minuti è feature core: per il trigger ogni 30s servono o **Piano Pro** (cron fino a ogni minuto... comunque non 30s) oppure un **trigger esterno** ogni 30s (cron-job.org, Upstash QStash) che chiama `https://vadobene.app/api/cron/close-juries?secret=$CRON_SECRET` — stessa cosa che fa il sidecar `cron` del compose (§4), replicabile self-host. Vedi RUNBOOK.md §Cron.
5. **Deploy**: automatico su push master (Vercel), oppure via workflow `deploy.yml` (build prebuilt: `vercel pull → vercel build → vercel deploy --prebuilt --prod`).

## 4. Docker (self-host)

Immagine multi-stage `Dockerfile` (deps → builder → runner, `node:20-slim` — mai alpine: sharp non gira su musl), runtime Next standalone (`output: "standalone"`).

1. **Build args**: le `NEXT_PUBLIC_*` sono inlineate nel bundle a build time — senza build-args il client parte senza Supabase/PostHog:
   ```bash
   docker build \
     --build-arg NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co \
     --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key> \
     --build-arg NEXT_PUBLIC_POSTHOG_KEY=<phc-...> \
     --build-arg NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com \
     --build-arg NEXT_PUBLIC_SITE_URL=https://vadobene.app \
     -t vadobene:latest .
   ```
   I secret server-side (`ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, ...) passano a runtime via env — MAI come build args (resterebbero nell'immagine).
2. **Run locale con sidecar cron**:
   ```bash
   cp .env.example .env.local   # riempi i valori
   docker compose -f docker-compose.local.yml up --build
   ```
   - `app`: porta 3000, `env_file: .env.local`, healthcheck su `/api/health`.
   - `cron` (alpine, crond): `close-juries` ogni minuto, `expire-photos` ogni ora — il giurì a 3 minuti funziona davvero in self-host (nessun limite Hobby).
3. **Healthcheck**: `HEALTHCHECK` nel Dockerfile usa `node -e` + fetch su `http://127.0.0.1:3000/api/health` (`node:20-slim` non include curl). L'endpoint è statico e dependency-free: non fallisce per un blip di Supabase.
4. **Rete aziendale con TLS interception**: il Dockerfile imposta `NODE_TLS_REJECT_UNAUTHORIZED=0` nei soli stadi di build (deps/builder) — senza, corepack non scarica pnpm (`SELF_SIGNED_CERT_IN_CHAIN`). Il runner resta pulito. In CI o su rete pulita è innocuo; rimuovibile per hardening. Nota: dietro proxy aziendale il download dei ~600 pacchetti pnpm nel container può essere molto lento (in CI è veloce).
5. **Produzione self-host**: dietro reverse proxy HTTPS (il webhook Stripe e i magic link richiedono https), con le env del §2 via secret manager o environment.

## 5. Migrazione DB — PRIMA del deploy

```bash
pnpm db:migrate   # applica supabase/migrations/0001_init.sql (usa SUPABASE_DB_URL)
```

**Ordine critico**: `0002` (privilegi colonna `users`, ledger `processed_events`, RPC atomiche `spend_credit`/`award_credit`/claim chiusura) va applicata **prima** del deploy del codice che usa le RPC — altrimenti le route nuova falliscono con `function ... does not exist`. Applicala a mano:

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/0002_atomic_ops.sql
```

Le migration non servono nell'immagine Docker (escluse da `.dockerignore`).

## 6. CI/CD

- **`.github/workflows/ci.yml`** — su ogni PR e push master:
  - `ci`: lint + typecheck + unit test + build
  - `e2e-mock`: e2e senza secrets (`--grep-invert=@real`) su ogni PR
  - `e2e-smoke`: e2e full-flow (`--grep=@real`) **con secrets, solo su push master**
  - `docker-build`: build immagine senza push (verifica che compili), su PR
- **`.github/workflows/deploy.yml`** — solo push master:
  - `vercel`: build prebuilt + deploy --prod + post-deploy check `/api/health`
  - `docker`: buildx + push GHCR (`ghcr.io/<owner>/<repo>:latest` e `:<sha>`)
- **Secrets GitHub richiesti** (Settings → Secrets and variables → Actions):

| Secret | A cosa serve |
|---|---|
| `VERCEL_TOKEN` | CLI vercel in deploy.yml (Vercel → Settings → Tokens) |
| `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` | da `.vercel/project.json` dopo `vercel link` |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | e2e-smoke + build-args immagine Docker |
| `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` / `NEXT_PUBLIC_SITE_URL` | build-args immagine Docker |
| `ANTHROPIC_API_KEY` | e2e-smoke (full-flow: primo parere AI) |

## 7. Verifica post-deploy

```bash
# Healthcheck (statico, sempre verde se l'app vive)
curl -fsS https://vadobene.app/api/health
# → {"ok":true,"ts":"2026-09-26T..."}

# Cron protetti (chi li chiama a mano)
curl -fsS "https://vadobene.app/api/cron/close-juries?secret=$CRON_SECRET"
curl -fsS "https://vadobene.app/api/cron/expire-photos?secret=$CRON_SECRET"
```

Checklist finale: `/` carica col marchio SVG ufficiale → foto + occasione → primo parere arriva → CTA giurì → 5 voti → summary → email. Controlla logs Vercel (o `docker logs`) per errori su `/api/verdict` e webhook Stripe.
