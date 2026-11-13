# Release operations — 2026-11-12

## Current deployment model

- Source: GitHub `orsinienrico/vadobene`, production branch `master`.
- Vercel project: `vadobene` in the **currently connected EON team**, ID `prj_JnEWjSpEEDt30zdgZbIYCKOhuJ9r`.
- Vercel team: `team_QYSDQHcilniTllqb9bf8iAoj` / `EON` (Hobby). An older `smtzjd5npb-2895's projects` scope is not accessible through the current connection and must not be confused with EON.
- Git integration: Vercel automatically builds the repository's linked branches.
- Framework: Next.js **15.5.29** (security patched); Node 22.x; functions in `fra1`.
- GitHub CI: lint, typecheck, unit tests, mock E2E (and real E2E on master).
- GitHub workflow `.github/workflows/deploy.yml`: manual **Docker fallback** only.
- No Vercel CLI deploy job, no GitHub VERCEL_TOKEN needed.

## Release gate

1. Create a feature branch and PR against master.
2. Verify lint, typecheck, unit, E2E mock, build and any migration compatibility.
3. Inspect Vercel Preview build and critical functionality.
4. Apply required Supabase schema migration **before** production code calls its new RPC.
5. Confirm service environment variables exist in Vercel Production/Preview, without ever printing secrets.
6. Merge tested PR to master. Vercel Git integration will deploy automatically.
7. Verify the production health endpoint and one actual user flow. Rollback using Vercel if checks fail.

**Warning:** master currently has no enforced branch protection. Treat PR checks as a release gate and do not push directly to master. Git integration alone does not wait for CI after a push.

## Database

Migration `0004_stripe_atomic_webhook.sql` introduces `process_stripe_event`, which ensures the Stripe ledger and credit/plan effect are committed together. It requires `0001`, `0002` and `0003` to have been applied first.

Never run every migration blindly on each deploy. Previously the workflow ran every SQL file without `ON_ERROR_STOP`, which could silently hide partial failures. Apply migrations once, in numeric order, with explicit failure detection and tracking. The GitHub deploy job no longer runs migrations.

## Environment variables

Configure the actual keys directly in Vercel Environment Variables for the relevant targets, following `DEPLOY.md` §2 and `.env.example`. Never commit production secrets.

Minimum to exercise the core flow: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`. For paid features additionally configure Stripe secrets/price IDs; for outbound email Resend.

## Time-based jobs — **production blocker**

The Vercel team is currently **Hobby**. Hobby cron supports only daily execution, which cannot fulfill the core product's promise of a jury closing in about three minutes or deletion close to 24 hours.

To avoid a rejected deploy and misleading schedules, `vercel.json` contains no Vercel cron entries. The protected route handlers remain available:
- `GET /api/cron/close-juries` — call approximately every 30–60 seconds with `Authorization: Bearer <CRON_SECRET>`.
- `GET /api/cron/expire-photos` — call at least hourly using the same authentication.

Provision an external trusted scheduler (or upgrade to Vercel Pro and configure minute cron) **before enabling real-user photo uploads**. Test authentication, observability, retry behavior and deletion timestamps. Vercel Pro minute cron does not provide a sub-minute strict SLA.

## Outstanding release blockers

- Supabase project access and confirmation that migrations 0001–0004 are installed.
- Vercel environment variables configured, plus a safe staging Supabase/Anthropic environment for E2E.
- Deploy and verify the prepared Cloudflare Worker in `infra/cloudflare/scheduler/` with the Vercel production `CRON_SECRET`. It has schedules for close-juries (each minute) and expire-photos (hourly). Set `SCHEDULER_CONFIRMED=true` **only** when both have passed real integration tests.
- Production domain ownership and DNS validation, if `vadobene.app` will be attached.
- End-to-end validation of signed photo delivery, payments, and expiration.
- Enforced master protection (recommended), incident monitoring and rollback rehearsal.

**Do not release to real users until these are resolved.**

## Current prelaunch protection

The homepage and all user-facing application APIs check `liveInteractionsEnabled(process.env)` on Vercel. Explicit `LAUNCH_ENABLED=true` is required in addition to configured providers and scheduler verification; otherwise requests fail with 503 before any database, AI or photo work.
If the requirements are not configured, visitors see a non-interactive
prelaunch message rather than an upload flow. Locally (without `VERCEL_ENV`),
the mock E2E experience remains testable.

`GET /api/health` is a dependency-free liveness check and can be HTTP 200
even when configuration is absent. `GET /api/readiness` returns HTTP 503
until the explicit launch flag and database, AI, scheduler, payment, email and public site URL
configuration are present. Configuration-only: it does not check
database migrations, API-key validity or real scheduler executions.
See `infra/cloudflare/scheduler/README.md`.

Vercel `CRON_SECRET` was generated and stored in encrypted environment
variables separately for Production and Preview/Development. The actual
Cloudflare Worker secret is **not** deployed: Cloudflare is not connected.
Never put any of these secrets in GitHub or public docs.


## Font privacy follow-up

The CI-compatible font loader currently requests the exact brand fonts via Google Fonts at runtime. Before public launch, replace it with approved locally hosted font assets to avoid third-party calls from visitor browsers and restore offline styling consistency. Track this in the launch validation.

## 2026-11-13 — security review addendum

- Production scope now is Vercel **EON**, not the legacy inaccessible scope. Do not assume environment variables, domains, or security policies from the previous scope are present in EON.
- EON deployment protection is applied to **all** targets, including production aliases, until integrations and security go-live checks pass. Vercel settings also restrict fork deploys, source maps and directory listing.
- `LAUNCH_ENABLED=false` is stored for all EON deployment targets, with separate encrypted `CRON_SECRET` values for production and non-production. Opening the UI does not authorize direct API calls: user-facing API routes have a server-side kill switch.
- Stateful browser POST routes reject cross-origin requests, and Stripe checkout/portal callback URLs are derived only from the trusted configured site URL, never from request headers.
- The account delete endpoint must not delete auth data if private Storage deletion failed. Images are re-encoded to JPEG to strip EXIF/GPS and bounded in size, with orphan cleanup on write failure.
- Database migrations and end-to-end private photo deletion cannot be verified until an authorized Supabase connection exists. Do **not** enable launches simply because the CI is green.
- Privacy copy must not promise deletion *before* 24h when the actual cron deletes only after the 24h cutoff; the operational retention guarantee and final GDPR notice require review before public launch.
- GitHub `master` still requires repository ruleset/branch protection and mandatory status checks; current GitHub tools cannot directly configure that setting.

## 2026-11-13 — vote schema + atomic awards

Migration `0005_vote_atomic_and_ai_unique.sql` repairs a defect in 0003: `UNIQUE NULLS NOT DISTINCT` prevented more than one AI vote per request. It replaces that with a partial unique index on non-null `juror_id`. It also revokes direct authenticated INSERT on `votes` and adds `record_jury_vote` (service_role only). This single Postgres transaction verifies the deadline, owner, cap of 5, uniqueness and inserts a vote while awarding exactly one credit and juror point. Run migration 0005 before the new API route is deployed to any active environment. Existing closed/incomplete jury data is not modified. DB-level integration tests must be performed after Supabase connection.

## 2026-11-13 — direct database/storage mutation lockdown

Migration `0006_restrict_client_mutations.sql` revokes direct INSERT, UPDATE and DELETE on `public.requests` from `anon`/`authenticated`, and removes client-side write policies on the private `outfits` bucket. These operations are now done by trusted Route Handlers with the service-role client, with authentication and ownership checks beforehand. The server signs 60-second outfit photo URLs for eligible jurors; an ordinary juror's own Supabase client is intentionally unable to sign another user's private files. Existing user read/RLS and own-photo read remain unchanged.

**Go-live database order:** 0001 → 0002 → 0003 → 0004 → 0005 → 0006. Verify the actual Supabase RLS policies before accepting uploads. The CI tests mock Supabase; they are not a substitute for a live DB integration test.

## 2026-11-13 — prevent client-inserted paid/credit profiles

An additional P0 privilege escalation existed in migration 0001: `users insert own` checked only `auth.uid()=id`, allowing a first insert with arbitrary `plan='pro'` or `jury_credit`. Migration 0006 now revokes direct client INSERT and remaining column UPDATE privilege for `public.users`; `/api/verdict` creates a minimal profile via service_role only, with `id` alone and `ignoreDuplicates=true`. No account can grant itself credits or Pro via the anonymous Supabase key. Before activation, verify this against a real authenticated anon client and RLS policies.
