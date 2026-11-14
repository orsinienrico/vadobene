# VadoBene — production architecture decision (2026-11-14)

## Decision

Use exactly one application hosting project, **Vercel EON / vadobene**, linked to `orsinienrico/vadobene:master`; the dedicated Supabase project `vzcbylzozovvvzgeacrt` provides Auth, Postgres, and private Storage. Integrations: Anthropic for outfit analysis, Stripe for hosted payments, Resend for outbound mail. Use **Vercel Pro native cron** at public launch; do not deploy a separate Cloudflare Worker.

This reduces credential sharing and the number of platforms with production privileges. Vercel Hobby is not suitable for commercial payment collection and cannot schedule minute-level jobs.

## Explicit stage gates

1. **Private prelaunch (now):** deployment protection ON, `LAUNCH_ENABLED=false`, `SCHEDULER_CONFIRMED=false`. Never collect real customer photos or money.
2. **Secure integration:** provision Supabase service-role key solely in Vercel server-side Production environment; store Anthropic, Stripe, Resend credentials as sensitive/encrypted project env vars, scoped to Production. Never commit secrets. Configure separate sandbox credentials for Preview. Review anonymous sign-in settings, RLS and payment lifecycle.
3. **Infrastructure:** move EON to Vercel Pro through authorized billing action; do not auto-upgrade. **Only after upgrade**, replace root `vercel.json` with the reviewed configuration in `infra/vercel/vercel.pro.json`. Until then, keep root `vercel.json` unchanged because Hobby rejects sub-daily cron.
4. **Scheduler:** Vercel automatically supplies the Production `CRON_SECRET` as a bearer header to native cron requests. Run close-juries once per minute and expire-photos every 5 minutes. Confirm both jobs on the deployed Production alias and monitor actual run history. A 5-minute schedule is best-effort, **not a guarantee of deletion at exactly 24 hours**; report measured deletion lag. Verify the private deployment protection mode and native cron compatibility before asserting success.
5. **E2E validation:** independently verify anonymous signup, photo EXIF removal and private Storage ACL, moderated AI verdict, five-person jury versus distinctly labeled AI fallback, credit awards under concurrent votes, Stripe paid and pending events (plus renewal, cancellation and payment failure), email notifications, full account deletion, 24-hour-retention batches, and dependency downtime.
6. **Release governance:** protect GitHub master with reviewed PR + required CI/security checks, configure runbook/alerts and rollback. Keep previews isolated from production DB and Stripe. Verify DNS ownership and GDPR legal copy.
7. **Launch:** set `SCHEDULER_CONFIRMED=true` only after real scheduler tests; set `LAUNCH_ENABLED=true` only after all other gates, then remove Production deployment authentication once public release is approved. This is a separate controlled action.

## Production endpoints and volumes

- `/api/cron/close-juries`: every 1 minute, max 20 pending requests per invocation. Oldest deadlines first; log failures and queue backlog.
- `/api/cron/expire-photos`: every 5 minutes, max 100 photos per invocation. Delete storage first, then clear database `photo_path` and mark expired; `backlogPossible=true` signals a possible lag. The queue must not silently grow unbounded.
- All user-facing write routes retain the explicit kill switch. Cron routes require `Authorization: Bearer <CRON_SECRET>`; webhook requires Stripe signature.
- Keep `/api/health` and `/api/readiness` semantically distinct. Readiness is currently configuration-only; independent service checks are still mandatory.
- Preserve existing application WAF protection and add per-user/rate-limit controls once the team plan permits; do not assume API WAF rules are available on Hobby.

## Cost and ownership

- Vercel Pro: base price at least USD 20/month plus any applicable usage, VAT and team seats; user must approve billing change.
- Supabase: managed service, separate project. Audit cost quotas and storage policy before traffic.
- Anthropic: pay-per-token costs, budget/abuse caps required.
- Stripe: test mode first, then live products and tax treatment verified by account owner.
- Resend: domain verified with appropriate SPF/DKIM/DMARC.

## Current blockers that cannot be bypassed safely

Missing Production server-side keys: `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, Stripe Price IDs, `RESEND_API_KEY`, `RESEND_FROM`. Separate provider account authorization/billing for paid services and production DNS may require owner action. Do **not** try to use the connected Stripe sandbox as the live processing account.

Production must remain inaccessible to public end users until the real end-to-end flows and privacy controls have passed.
