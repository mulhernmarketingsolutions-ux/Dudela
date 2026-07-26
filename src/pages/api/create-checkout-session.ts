import type { APIContext } from "astro";
import { createCheckoutSession } from "../../lib/stripe";

export const prerender = false;

// Buy buttons on product pages hit this route (GET, e.g. /api/create-checkout-session?product=prep-kit),
// it creates a Stripe Checkout Session for the right price, and redirects the buyer straight
// to Stripe's hosted checkout page. On success, Stripe redirects back to `successUrl`; the actual
// purchase confirmation + Loops tagging happens in /api/stripe-webhook.ts once Stripe's webhook
// fires — never trust the redirect alone, since a buyer can close the tab before it happens.
//
// Required Cloudflare secrets: STRIPE_SECRET_KEY (see lib/stripe.ts), plus one STRIPE_PRICE_*
// var per product below.
const PRODUCTS: Record<string, { priceEnvVar: string; returnPath: string }> = {
  "prep-kit": { priceEnvVar: "STRIPE_PRICE_PREP_KIT", returnPath: "/kit" },
};

export async function GET({ request, locals }: APIContext) {
  const env = (locals as any).runtime.env;
  const url = new URL(request.url);
  const product = url.searchParams.get("product") || "prep-kit";
  const email = url.searchParams.get("email") || undefined;

  const productConfig = PRODUCTS[product];
  if (!productConfig) {
    return new Response(`Unknown product "${product}"`, { status: 400 });
  }

  const priceId = env[productConfig.priceEnvVar];
  if (!priceId) {
    console.error(`Missing env var ${productConfig.priceEnvVar} for product "${product}"`);
    return new Response("Checkout is temporarily unavailable. Try again shortly.", { status: 500 });
  }

  const origin = url.origin;
  try {
    const session = await createCheckoutSession(env, {
      priceId,
      successUrl: `${origin}${productConfig.returnPath}?purchase=success`,
      cancelUrl: `${origin}${productConfig.returnPath}?purchase=canceled`,
      customerEmail: email,
      metadata: { product },
    });

    return new Response(null, {
      status: 302,
      headers: { Location: session.url },
    });
  } catch (err) {
    console.error("Stripe checkout session creation failed:", err);
    return new Response("Checkout is temporarily unavailable. Try again shortly.", { status: 500 });
  }
}
