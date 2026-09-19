/**
 * PostHog client-side — Fase 4. Eventi del funnel definiti in docs/ANALYTICS.md.
 * Caricato dinamicamente: zero peso se non configurato.
 */
const EVENTS = [
  "photo_added",
  "occasion_selected",
  "verdict_ai",
  "jury_requested",
  "vote_cast",
  "jury_closed",
  "card_shared",
  "boost_purchased",
  "pro_subscribed",
] as const;

export type AnalyticsEvent = (typeof EVENTS)[number];

export async function track(event: AnalyticsEvent, props: Record<string, unknown> = {}) {
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
