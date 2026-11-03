/**
 * PostHog client-side — Fase 4. Eventi del funnel definiti in docs/ANALYTICS.md.
 * Caricato dinamicamente: zero peso se non configurato.
 */
const EVENTS = [
  "photo_added",
  "occasion_selected",
  "verdict_ai",
  "jury_requested",
  "jury_ai_fill",
  "vote_cast",
  "jury_closed",
  "card_shared",
  "boost_started",
  "boost_purchased",
  "pro_subscribed",
  "jury_open_failed",
] as const;

export type AnalyticsEvent = (typeof EVENTS)[number];

export async function track(event: AnalyticsEvent, props: Record<string, unknown> = {}) {
  // Safe in test/node: mai fuori dal browser, mai senza chiave, mai un throw.
  if (typeof window === "undefined") return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  try {
    const posthog = (await import("posthog-js")).default;
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
      // init è idempotente; capture funziona anche prima del load completo
      capture_pageview: false,
    });
    posthog.capture(event, props);
  } catch {
    // Analytics non deve mai rompere il flusso.
  }
}

/**
 * PostHog server-side — solo Route Handler fidati (webhook Stripe).
 * Capture API diretta: nessuna dipendenza extra. Con timeout di 3s e mai
 * un throw: l'analitica non deve mai far fallire l'effetto principale.
 */
export async function trackServer(
  event: AnalyticsEvent,
  distinctId: string,
  props: Record<string, unknown> = {}
) {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || typeof window !== "undefined") return;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";
  try {
    await fetch(`${host}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: key, event, distinct_id: distinctId, properties: props }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Analytics non deve mai rompere il flusso.
  }
}
