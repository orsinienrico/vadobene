import { describe, expect, it, vi } from "vitest";
import { runScheduledTask } from "../../infra/cloudflare/scheduler/index";

const env = {
  APP_ORIGIN: "https://vadobene.app",
  CRON_SECRET: "test-private-secret",
};

describe("Cloudflare scheduler", () => {
  it("calls the jury endpoint once per minute with Bearer authentication", async () => {
    const transport = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("{}", { status: 200 }));
    await runScheduledTask("* * * * *", env, transport);
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, init] = transport.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe("https://vadobene.app/api/cron/close-juries");
    expect(init.headers).toEqual({
      Authorization: "Bearer test-private-secret",
      "Cache-Control": "no-store",
    });
  });

  it("calls photo retention hourly, separately from jury trigger", async () => {
    const transport = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("", { status: 200 }));
    await runScheduledTask("0 * * * *", env, transport);
    expect(String(transport.mock.calls[0][0])).toBe("https://vadobene.app/api/cron/expire-photos");
  });

  it("refuses missing credentials and insecure URL", async () => {
    const transport = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("", { status: 200 }));
    await expect(runScheduledTask("* * * * *", {}, transport)).rejects.toThrow("not configured");
    await expect(runScheduledTask("* * * * *", {
      ...env, APP_ORIGIN: "http://vadobene.app",
    }, transport)).rejects.toThrow("HTTPS");
    expect(transport).not.toHaveBeenCalled();
  });

  it("refuses unsupported cron patterns and fails on unauthorized response", async () => {
    await expect(runScheduledTask("*/5 * * * *", env)).rejects.toThrow("Unknown");
    const transport = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("", { status: 401 }));
    await expect(runScheduledTask("* * * * *", env, transport)).rejects.toThrow("401");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("retries server failure once without logging secret", async () => {
    const transport = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('', {status: 200}))
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response("", { status: 200 }));
    await runScheduledTask("* * * * *", env, transport);
    expect(transport).toHaveBeenCalledTimes(2);
  });
});
