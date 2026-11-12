# VadoBene · Cloudflare Worker scheduler

This is the **scheduler only**. The Next.js app stays on Vercel and the
Postgres/Auth/Storage backend stays on Supabase.

## Operation

| Cron (UTC) | Endpoint | Requirement |
|---|---|---|
| `* * * * *` | `GET /api/cron/close-juries` | Every minute; closures can be up to one minute past deadline |
| `0 * * * *` | `GET /api/cron/expire-photos` | Hourly; deletion is *after* the 24-hour cutoff, not strictly within 24h |

Calls use the same production `CRON_SECRET` as Vercel, passed in the
`Authorization: Bearer ...` header. No secret is committed or logged. A
transient server error gets one retry. Invalid credentials are **not** retried.

## Provisioning prerequisites

- An authorized Cloudflare Workers account and Wrangler CLI access.
- DNS for `vadobene.app` configured and Vercel production actually serving
  the app with authenticated cron endpoints.
- Supabase migrations 0001–0004 applied and service-role env configured.
- Production `CRON_SECRET` already configured inside Vercel.

## Deploy with Cloudflare authorization

Run from `infra/cloudflare/scheduler` on a trusted machine:

```sh
npx wrangler login
npx wrangler secret put CRON_SECRET
npx wrangler deploy
```

**Do not** paste the secret in a chat, GitHub issue, command argument, PR,
log, .env committed to Git, or Wrangler `vars`. Enter it into the interactive
secret prompt or a trusted secrets workflow.

`wrangler.jsonc` already configures `APP_ORIGIN=https://vadobene.app`,
cron schedules and observability. Do **not** deploy until domain is correct.

## Verify before enabling users

1. Watch a scheduled run in the Cloudflare Workers dashboard (Cron Triggers
   Past Events and Observability) and confirm HTTP success.
2. Ensure `/api/cron/close-juries` refuses unauthenticated requests and
   responds successfully with the Worker secret.
3. Check that a test Giurì closes after its 180-second deadline.
4. Use a test photo with a past retention cutoff and verify Storage deletion
   and request expiration. **Important:** hourly expiry is not a strict
   delete-at-24h guarantee. If the product policy promises at most 24h,
   use a more frequent retention trigger and audit the deletion lag.
5. Configure alerts for cron errors or missing executions; Cloudflare
   scheduling is best-effort, not a strict execution-time SLA.
6. Set `SCHEDULER_CONFIRMED=true` on the Vercel production project only
   after both jobs have been observed working. This is an operator assertion.

## Rollback and recovery

- Disable Cron Triggers in `wrangler.jsonc` using `crons: []`, then deploy.
- Do not revoke the production Vercel secret during a rolling deploy unless
  both sides are updated.
- To investigate lost executions, inspect Cloudflare logs and Vercel runtime
  logs. Both route handlers must remain idempotent.

This worker must not receive incoming public HTTP traffic
(`workers_dev=false` and no routes).
