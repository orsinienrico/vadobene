# VadoBene — invite-only beta rollout (2026-11-14)

## Decision

Ship a **functional, invite-only beta** on a stable Cloudflare Workers hostname, separate from the Cloudflare *migration preview* and unrelated existing apps. Cloudflare Access remains on developer/preview URLs; app users authenticate separately with **Supabase Auth email OTP** (no password) and must match a server-only beta allowlist.

Initial QA: 10–15 trusted users. Then 30–50 participants **in shared peak time windows**, because five actual human votes in three minutes require an active jury. Missing human votes are always labeled AI. No live charges in beta.

## Existing capabilities

- Supabase Auth anonymous sessions + magic link in vote gate; `/me` profile, deletion.
- Free jury credits and server-side voting.
- Stripe Checkout one-time Boost, monthly/yearly Pro and Billing Portal; webhook signature & idempotent initial Checkout grants.
- Cloudflare Worker, custom Images binding, cron handlers. Existing production remains **OFF**, and protected developer preview remains **ON**.

## Code staged on this branch

- `/login`: email OTP `signInWithOtp({shouldCreateUser:false})` + six-digit `verifyOtp`. A new user cannot self-register through this form.
- `/api/beta/status`: server-side check for Supabase-authenticated, non-anonymous email in `BETA_ALLOWED_EMAILS`; no allowlist data returned to client.
- `/api/verdict`, `/api/queue/next`, `/api/vote`, `/api/jury/open`: independent server invite check before any private photo, Anthropic, jury or DB mutation. No trust in user-supplied email.
- Home `Flow`: visible only to approved users during active beta; everyone else gets login/status UI. Landing and privacy pages remain public on **beta domain**, protected developer previews unchanged.
- `BETA_ENABLED=false` and `BETA_READY_CONFIRMED=false` are fail-closed.
- `/api/verdict` consumes a service-role-only atomic daily quota, returning HTTP 429 when used up; if the quota RPC fails/unavailable it returns 503 before any Anthropic call. `LAUNCH_ENABLED=false` still prevents Stripe Checkout and Portal in beta.
- Small pilot allowlist uses **Cloudflare Worker Secret** `BETA_ALLOWED_EMAILS`, comma-separated; never put emails in public `NEXT_PUBLIC_*` variables or repository. For >50 users, move to a server-managed DB invitation table and admin UX.
- Server beta readiness requires existing DB, AI, cron, email and site URL configuration, explicit scheduler confirmation, invite allowlist, and an explicit operator sign-off flag. This is a configuration gate, **not proof of a passing E2E test**.

## Mandatory operator setup — before inviting real people

1. **Separate stable beta hostname**: Activate only a dedicated VadoBene production Worker hostname such as `vadobene.casabearpisa.workers.dev` or a separate DNS subdomain. Never disable Access on the protected `cloudflare-migration` development preview. Configure `NEXT_PUBLIC_SITE_URL` exactly; configure Supabase Auth allowed origins/redirects.
2. **Auth**: In the **dedicated VadoBene** Supabase project, disable unrestricted public signups for the pilot; create users using Auth admin invitation. Email OTP requires custom SMTP (Resend), validated sending domain/SPF/DKIM/DMARC, and Auth Email template containing `{{ .Token }}`. Default Supabase SMTP cannot send freely to external testers and limits emails.
3. **Invite allowlist**: Add the invited addresses to the Worker Secret `BETA_ALLOWED_EMAILS` (comma-separated). Do not place that data in GitHub or user-facing variables. Removing an invite does not revoke an existing Supabase Auth session — the server checks the allowlist per protected call. For immediate forced logout, revoke sessions via admin.
4. **Secrets**: Scope Supabase URL/publishable key and service-role secret, Anthropic key, Resend API key and sender, CRON_SECRET to the VadoBene beta Worker only. Do not reuse the other Cloudflare app's credentials. Keep Stripe LIVE secrets absent.
5. **Scheduler & private storage**: Enable `SCHEDULER_ENABLED=true` **only** after the cron is observed on a test environment. Confirm both endpoints, finite batch handling, email failures and photo storage private bucket, size limit, JPEG re-encoding, EXIF/GPS stripping, automatic delete lag from 24h cutoff. Set `SCHEDULER_CONFIRMED=true` only after real runs. No 24h deletion guarantee can be claimed without measuring lag.
6. **Cost controls P0**: The branch now includes `supabase/migrations/0010_beta_ai_daily_quota.sql` and the fail-closed `consume_beta_ai_daily_quota` RPC (3 AI first-verdict attempts per invited user per UTC day). The migration has **NOT** been applied yet. Validate the quota concurrently on a staging database, run Supabase RLS/security advisors, verify global Anthropic budget hard limits and additional IP-based abuse controls. This quota covers the initial verdict API, not every possible AI moderation/jury-fill call. **Do not turn on `BETA_READY_CONFIRMED` yet**.
7. **Privacy & legal**: Show complete GDPR disclosures (controller contact, service providers, retention and deletion). Ensure all users consent/agree before uploading; avoid children/minors in photos, no profile/identity inference, no public photos. Verify `/me/delete-all` and signed URL expiry. The current privacy page is not sufficient as a full legal notice.
8. **E2E sign-off**: Invite 2 operator-controlled addresses, verify OTP on iPhone and desktop, allowlist 401/403, real photo normalization and private read access, human votes, AI fallback labeling, photo deletion, email delivery, concurrency, abuse prevention, logout/deletion, rollback. Then only set `BETA_READY_CONFIRMED=true` and `BETA_ENABLED=true`. Do not enable `LAUNCH_ENABLED` or Stripe live secrets.

## Commercial transition (not activated)

Existing prices in the code: Boost €0.99, Pro €3.99/month, Pro €29/year. Do not market these as confirmed or collect money yet. A €0.99 payment incurs a high relative fixed Stripe fee; test bundles instead (for example, 3 Boosts as one checkout).

Stripe currently grants a Pro entitlement on paid Checkout and handles deleted subscription, but **does not fully reconcile** `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, reactivation, unpaid/past_due, or out-of-order cancellation. Complete and test this against Stripe sandbox before live billing; never infer payment success from a redirect. Live payments need authorized Stripe business account, webhook, legal/tax/consumer obligations, refunds and subscription cancellation information.

**Launch order**: paid Stripe **sandbox** E2E → review pricing and plan entitlements → tax/legal/account readiness → limited real-paying cohort → expand if service metrics and reliability are acceptable.

## Success metrics for pilot

- Activation: invited → OTP completed → first photo.
- Time-to-value: upload → AI result (median/p95).
- Core value: fraction of jury results with 3+ *human* votes; share of AI fills; 3-minute deadline reliability.
- Retention: second session within 7 days; repeat requests per user.
- Economics: Anthropic cost per verdict, cost per user/day, email + image processing + DB/Worker per request.
- Trust: lost photo reports, privacy requests, abuse flags, deletion lag, subscription/refund incidents.

## Current release state

- Work here is staged on `beta/invite-only-onboarding` for review **against `cloudflare/migration`** (draft PR #22 is not merged into `master`).
- Worker production hostname and real API interactions remain disabled. No invitations have been sent and no payments created by this change.
- **Do not merge to production until the P0 gates above pass.**
