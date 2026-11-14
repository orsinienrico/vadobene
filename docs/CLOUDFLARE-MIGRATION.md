# VadoBene — Cloudflare migration (decision 2026-11-14)

## Approved target

Reuse the **existing Cloudflare account**, but deploy VadoBene as a **new, independently named Worker**, not as an update or environment of the other application. Use the existing dedicated Supabase project `vzcbylzozovvvzgeacrt`, plus Anthropic, Stripe, Resend. Do not modify the other Cloudflare application, its routes, secrets, zone, DNS, or build settings.

Target repository: `orsinienrico/vadobene`.
Migration branch: `cloudflare/migration`.
Production: `master` only after independent CI and private canary verification.
Hosting: **Cloudflare Workers** (full-stack), not a static Cloudflare Pages export.

## Compatibility path

The application currently runs Next.js 15.5.29 (App Router and API route handlers). Cloudflare's documented supported adapter for an existing Next.js 15 project is OpenNext; vinext is recommended generally but still beta. Initial compatibility spike: use `@opennextjs/cloudflare` / Wrangler with `nodejs_compat`, pinned versions, and a committed lockfile. Verify all runtime routes under Wrangler, not only `next build`.

**Critical migration blocker:** `src/app/api/verdict/route.ts` imports native `sharp`, which cannot be assumed to run in Workers. Replace server-side re-encode/resize with Cloudflare Images binding processing private image bytes. Enforce strict upload byte size and decoded pixel caps, orientation, <=1280 px output JPEG, no EXIF/GPS, then verify with real sample photos and metadata inspection. Do not accept unprocessed photos as a fallback.

Other adapter checks: Supabase SSR cookies, Stripe signature raw body, Stripe webhooks and portal, Anthropic SDK + AI fill, protected cron routes, Resend delivery, `process.env` secret access, CSP/security headers, and service-role separation.

## Scheduler

Prefer a new **private** (no public route) Cloudflare Worker cron in the same account only if necessary; otherwise implement cron in the dedicated app Worker using compatible scheduled handler. Never re-use an existing unrelated Worker's scheduler. Close jury every minute, expire photo every five minutes. Storage is private Supabase, not a public image bucket. Retention needs measured enforcement/backlog monitoring.

## Account and billing

Workers Paid's base subscription is per-account (USD 5/month minimum, plus overages), not per Worker. If the account is already on Workers Paid, creating another Worker generally does not create another base charge. The existing Cloudflare account might be Free or Paid; do not assume which. Images transformations have separate quotas, check actual consumption. No billing upgrade or DNS alteration without user authorization.

## Release policy

- Leave original Vercel project and `LAUNCH_ENABLED=false` intact during migration.
- Do not collect real photos or payments on Cloudflare until end-to-end tests pass.
- Use distinct Worker secrets, never copy credentials from existing unrelated app.
- Keep `SCHEDULER_CONFIRMED=false` until the CF scheduled job truly runs and is observed.
- Change `NEXT_PUBLIC_SITE_URL` and payment/email links only to a confirmed Cloudflare domain at cutover.
- Verify GitHub branch protection, encryption, 24-hour photo deletion behavior, AI cost controls, Stripe subscription lifecycle, GDPR and account deletion.
- After Cloudflare green tests and a rollback plan, intentionally cut over the chosen domain; then retire Vercel separately.

## Operational authorization needed

There is presently no Cloudflare account connector exposed to this conversation. A user with access to the *existing* Cloudflare Dashboard must select that account, create a **new** Cloudflare Workers application/project (never reuse an existing project), authorize GitHub access to `orsinienrico/vadobene`, and configure account-level access for a later verified deploy. Do not paste API tokens or secrets in chat.

Cloudflare docs:
- https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
- https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/
- https://developers.cloudflare.com/images/optimization/binding/
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/workers/configuration/cron-triggers/


## Implementation and Cloudflare dashboard linkage

Cloudflare Workers GitHub integration has reported a build check for the Worker **vadobene**.
The migration branch now contains:
- `wrangler.jsonc`: Worker name `vadobene`, private by default (`workers_dev=false`), Cloudflare Images binding, guarded cron triggers, and `build.command="pnpm cf:build"` so **default `wrangler deploy` automatically builds the OpenNext bundle**.
- `custom-worker.ts`: same Next.js fetch handler plus a scheduled handler, which requires `SCHEDULER_ENABLED=true` and `CRON_SECRET` before calling the authenticated app cron routes internally.
- `src/lib/photo-processing.ts`: rejects oversized/corrupt images, checks dimensions, re-encodes JPEG via Images binding and strips JPEG APP metadata before sending to Anthropic or Supabase. Original Node/Sharp implementation remains as non-Cloudflare fallback.
- `cloudflare-compatibility.yml`: GitHub CI runs Wrangler dry-run with no credentials. An additional local Workers smoke test checks health and prelaunch denial.

**Cloudflare Dashboard > Workers & Pages > vadobene > Settings > Build:**
- Root directory: repository root
- Production branch: `master` (do **not** change to migration branch during validation)
- Build command: leave blank (or use `pnpm cf:build`, but that duplicates the Wrangler build hook)
- Deploy command: `npx wrangler deploy` (uses the `build.command` hook)
- Enable preview builds for pull requests/branches as appropriate. Do not activate production public URL before completing integration tests.

A failed Cloudflare-native build check from an earlier migration commit is **not proof the latest code still fails**. Verify the newest Cloudflare build by its commit and logs in the dashboard. The GitHub no-credentials dry-run verifies packaging but **does not verify an authenticated Cloudflare deployment**, the live Images binding, account plan limits, or real services.

Keep all production secrets in Cloudflare Worker Secrets (never repo/chat), and provide a separate staging Supabase/Stripe environment for live end-to-end tests. `LAUNCH_ENABLED`, `SCHEDULER_ENABLED` and `SCHEDULER_CONFIRMED` must remain false until the release gates pass.
