/**
 * Cloudflare Worker: external scheduler for Vercel Hobby.
 * Never exposes an HTTP handler and never logs CRON_SECRET or response bodies.
 * Deploy with wrangler after provisioning domain + Vercel production secrets.
 */
export interface SchedulerEnv {
  APP_ORIGIN?: string;
  CRON_SECRET?: string;
}

export const CRON_ENDPOINTS: Readonly<Record<string, string>> = {
  "* * * * *": "/api/cron/close-juries",
  "0 * * * *": "/api/cron/expire-photos",
};

export async function runScheduledTask(
  cron: string,
  env: SchedulerEnv,
  transport: typeof fetch = fetch
): Promise<void> {
  const path = CRON_ENDPOINTS[cron];
  if (!path) throw new Error("Unknown scheduled task");
  if (!env.CRON_SECRET || !env.APP_ORIGIN) {
    throw new Error("Scheduler is not configured");
  }

  const origin = new URL(env.APP_ORIGIN);
  // No unencrypted transport, URL credentials or URLs with path/query.
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  ) {
    throw new Error("APP_ORIGIN must be a bare HTTPS origin");
  }

  const url = new URL(path, origin);
  // A short retry handles transient Vercel 429/5xx without duplicate effects:
  // close-juries uses claim_jury_close, expire-photos selects unexpired records.
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await transport(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${env.CRON_SECRET}`,
          "Cache-Control": "no-store",
        },
        redirect: "error",
      });
    } catch (err) {
      if (attempt === 1) throw err;
      continue;
    }
    if (res.ok) return;
    if (res.status < 500 && res.status !== 429) {
      throw new Error(`Scheduled task ${cron} HTTP ${res.status}`);
    }
    if (attempt === 1) {
      throw new Error(`Scheduled task ${cron} HTTP ${res.status} after retry`);
    }
  }
}

export default {
  async scheduled(controller: { cron: string }, env: SchedulerEnv): Promise<void> {
    await runScheduledTask(controller.cron, env);
  },
};
