import Stripe from "stripe";

let _stripe: Stripe | null = null;

/** Client Stripe — solo server-side. */
export function stripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2025-02-24.acacia",
    });
  }
  return _stripe;
}

/** Prezzi dai price ID configurati in env (creati su Stripe Dashboard). */
export const PRICE_IDS = {
  boost: process.env.STRIPE_PRICE_BOOST ?? "",
  proMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? "",
  proYearly: process.env.STRIPE_PRICE_PRO_YEARLY ?? "",
};
