# Release operations — 2026-11-12

## Current deployment model

- Source: GitHub `orsinienrico/vadobene`, production branch `master`.
- Vercel project: `vadobene`, ID `prj_GvdLkED3XeWQzrWBBwwHe1eiaIxP`.
- Vercel team: `team_dhdJkA7tBMCCDdN4HMhdvHZu` (Hobby).
- Git integration: Vercel automatically builds the repository's linked branches.
- Framework: Next.js; Node 22.x; functions in `fra1`.
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
- Reliable scheduler for `close-juries` and `expire-photos`.
- Production domain ownership and DNS validation, if `vadobene.app` will be attached.
- End-to-end validation of signed photo delivery, payments, and expiration.
- Enforced master protection (recommended), incident monitoring and rollback rehearsal.

**Do not release to real users until these are resolved.**
