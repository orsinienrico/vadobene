# VadoBene — deployment decision (updated 2026-11-14)

## Selected architecture

**Cloudflare Workers** is the selected hosting target for VadoBene (Next.js 15 via OpenNext). The user explicitly chose the existing Cloudflare account, with a **separate Worker named `vadobene`**, never reusing or editing unrelated Workers.

- Source: private GitHub repository `orsinienrico/vadobene`, production branch `master`.
- Frontend/API: Cloudflare Workers, `@opennextjs/cloudflare`, `wrangler.jsonc`, Cloudflare Images binding for private image normalization.
- Auth, data and private photos: dedicated Supabase project `vzcbylzozovvvzgeacrt`.
- First outfit opinion and moderation: Anthropic.
- Email: Resend (including custom Supabase Auth SMTP for invited-user OTP).
- Payments: Stripe (sandbox first; live payments separately authorized).
- Scheduled jury closure and photo expiry: guarded Cloudflare Worker scheduled handler, disabled until independently tested.
- **Vercel is a protected fallback only**, not the selected commercial production architecture. No automatic Vercel Pro purchase or Vercel cutover.

The former Vercel-only decision has been superseded. Historical Vercel design references in `docs/RELEASE-OPERATIONS.md` and `infra/vercel/` describe fallback/legacy behavior only. Canonical Cloudflare migration details: `docs/CLOUDFLARE-MIGRATION.md`.

## Delivery state

- Migration branch `cloudflare/migration`, draft PR #22, GitHub CI and Cloudflare preview deployment succeeded. The owner has entered `https://cloudflare-migration-vadobene.casabearpisa.workers.dev/` after Cloudflare Access authentication.
- The existing preview deliberately exposes only read-only landing/privacy/static assets and a dependency-free health endpoint. Private data, photo POST, cron and Stripe are denied (403).
- Beta onboarding is built in a separate stacked branch and PR #23, with all release flags off. It introduces an invite-only Supabase OTP login and a separate free-beta gate.
- **Not launched**. Preview deployment is not evidence that a real Cloudflare Images transformation, Supabase SSR Auth, Anthropic request, email delivery, signed photo, Stripe webhook or scheduled job has passed integration tests.

## Release phases and mandatory gates

1. **Migration/build (Step 1):** keep OpenNext/Wrangler pinned, pass lint, types, unit, mock E2E, real local workerd smoke and Cloudflare Preview build. Verify owner can access private preview behind Access. Do not share preview as public beta.
2. **Invite/login implementation (Step 2):** server-side invite allowlist; require Supabase-authenticated, verified email; no public self-registration; allow read-only login UI preview; all beta functionality disabled until separate release gate.
3. **Integration (Step 3–4):** configure isolated secrets and public beta hostname, verified Supabase/Auth SMTP, real Cloudflare Images normalization, JWT/cookie persistence, RLS, AI moderation, real jury voting, 24h photo expiry, scheduler, account deletion, cost/abuse controls and incident alerting.
4. **Limited beta:** enable `BETA_ENABLED=true` and `BETA_READY_CONFIRMED=true` only after real operational tests and legal/privacy approval; Stripe checkout remains off via `LAUNCH_ENABLED=false`. Start with trusted users and controlled testing windows.
5. **Commercial:** complete subscription entitlement lifecycle (renewals, failed payments, cancellation, retries), Stripe sandbox and legal/tax obligations. Only then consider live payments and `LAUNCH_ENABLED=true`.

## Non-negotiable controls

- Do not commit credentials, personally identifiable invite lists or photos to GitHub.
- Keep developer previews behind Cloudflare Access; no blanket policy on other Workers.
- Photos remain private, normalized to <=1280 px JPEG with EXIF/GPS removed, subject to upload pixel/size caps, and deletion after approximately 24h with measured scheduling lag.
- A scheduled task's availability and the configured launch gate are different checks: `/api/health` only proves liveness; `/api/readiness` reports configuration, not external connectivity.
- Deploy from `master` only after the remaining integration gates; keep a tested rollback to the Vercel fallback if cutover fails.

## Cost and approvals

Workers account plan and Images binding processing may incur costs; don't change plan or billing without authorization. Anthropic is usage-billed and requires a per-user quota plus aggregate provider budget. Stripe real charges require a verified merchant account and explicit launch authorization.

**The first real beta users must not be invited until authentication, cost limits, private photos, 24h deletion and real Cloudflare scheduled jobs have passed integration tests.**
