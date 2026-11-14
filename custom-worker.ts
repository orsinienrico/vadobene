// Reuse the OpenNext-generated Next.js fetch handler and add isolated cron jobs.
// The generated import is only available after `opennextjs-cloudflare build`.
// @ts-ignore OpenNext generates this module during the adapter build.
import app from "./.open-next/worker.js";

const CRONS: Record<string, string> = {
  "* * * * *": "/api/cron/close-juries",
  "*/5 * * * *": "/api/cron/expire-photos",
};

type SchedulerBindings = {
  CRON_SECRET?: string;
  SCHEDULER_ENABLED?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  VB_PREVIEW_LOCKED?: string;
};

export default {
  fetch(request: Request, env: SchedulerBindings, ctx: unknown) {
    // Preview URLs are public by default. Only an unprivileged healthcheck is
    // allowed until Cloudflare Access is configured and explicitly approved.
    if (env.VB_PREVIEW_LOCKED === "true" && new URL(request.url).pathname !== "/api/health") {
      return new Response(JSON.stringify({ error: "Preview non accessibile." }), {
        status: 403,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex, nofollow",
        },
      });
    }
    return app.fetch(request, env, ctx);
  },
  async scheduled(controller: { cron: string }, env: SchedulerBindings, ctx: unknown) {
    // Migration defaults to OFF. Do not run privileged DB jobs in a preview.
    if (env.SCHEDULER_ENABLED !== "true") return;
    const path = CRONS[controller.cron];
    if (!path) throw new Error("Unknown VadoBene cron schedule");
    if (!env.CRON_SECRET) throw new Error("Cron secret missing");

    // Internal dispatch through the application handler, not an external request
    // or a public endpoint. Authorization is never logged or put in a URL.
    const site = env.NEXT_PUBLIC_SITE_URL;
    if (!site || !site.startsWith("https://")) throw new Error("Invalid app origin");
    const origin = new URL(site);
    if (origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password) {
      throw new Error("Invalid app origin");
    }
    const response = await app.fetch(
      new Request(new URL(path, origin), {
        method: "GET",
        headers: { Authorization: `Bearer ${env.CRON_SECRET}`, "Cache-Control": "no-store" },
      }),
      env,
      ctx
    );
    if (!response.ok) throw new Error(`VadoBene cron ${controller.cron} failed with HTTP ${response.status}`);
  },
};
