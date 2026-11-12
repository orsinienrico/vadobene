/**
 * Coarse deployment readiness gate (configuration only; not a live dependency probe).
 * Never expose environment variable values. A successful /api/health is liveness
 * only and does not imply the product is ready to accept photos or payments.
 *
 * SCHEDULER_CONFIRMED is an operator assertion, not a runtime guarantee:
 * set it only after verifying authenticated periodic close-juries/expire-photos.
 */
export function releaseReadiness(env: Readonly<Record<string, string | undefined>>) {
  const database =
    Boolean(env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(env.NEXT_PUBLIC_SUPABASE_ANON_KEY) &&
    Boolean(env.SUPABASE_SERVICE_ROLE_KEY);
  const ai = Boolean(env.ANTHROPIC_API_KEY);
  const scheduler =
    Boolean(env.CRON_SECRET) && env.SCHEDULER_CONFIRMED === "true";
  const payments =
    Boolean(env.STRIPE_SECRET_KEY) &&
    Boolean(env.STRIPE_WEBHOOK_SECRET) &&
    Boolean(env.STRIPE_PRICE_BOOST) &&
    Boolean(env.STRIPE_PRICE_PRO_MONTHLY) &&
    Boolean(env.STRIPE_PRICE_PRO_YEARLY);
  const email =
    Boolean(env.RESEND_API_KEY) &&
    Boolean(env.RESEND_FROM);
  const siteUrl = Boolean(env.NEXT_PUBLIC_SITE_URL);

  const services = { database, ai, scheduler, payments, email, siteUrl };
  return {
    configured: Object.values(services).every(Boolean),
    services,
  };
}
