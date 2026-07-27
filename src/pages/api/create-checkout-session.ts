import type { APIContext } from "astro";
import { createCheckoutSession } from "../../lib/stripe";
import { countMerchOrders } from "../../lib/db";

export const prerender = false;

// Buy buttons on product pages hit this route (GET, e.g. /api/create-checkout-session?product=prep-kit),
// it creates a Stripe Checkout Session for the right price, and redirects the buyer straight
// to Stripe's hosted checkout page. On success, Stripe redirects back to `successUrl`; the actual
// purchase confirmation + Loops tagging happens in /api/stripe-webhook.ts once Stripe's webhook
// fires — never trust the redirect alone, since a buyer can close the tab before it happens.
//
// Required Cloudflare secrets: STRIPE_SECRET_KEY (see lib/stripe.ts), plus one STRIPE_PRICE_*
// var per product below.
const PRODUCTS: Record<
  string,
  {
    priceEnvVar: string;
    returnPath: string;
    thankYouPath: string;
    mode: "payment" | "subscription";
    // Physical goods need a shipping address collected at Stripe checkout.
    shipping?: boolean;
    // Presale scarcity: this colorway's cap in merch_orders (see lib/db.ts).
    // Only set on the 3 hat products — undefined means "no cap, don't check."
    merchColor?: string;
    merchCap?: number;
  }
> = {
  "prep-kit": {
    priceEnvVar: "STRIPE_PRICE_PREP_KIT",
    returnPath: "/kit",
    thankYouPath: "/kit/thank-you",
    mode: "payment",
  },
  "spit-up-society": {
    priceEnvVar: "STRIPE_PRICE_SPIT_UP_SOCIETY",
    returnPath: "/join/spit-up-society",
    thankYouPath: "/join/spit-up-society/thank-you",
    mode: "subscription",
  },
  // The 4 buyable hats — see lib/printful.ts HAT_CATALOG for the design/color/thread
  // config each of these slugs maps to. All four share one $38 Stripe price (same
  // physical cost regardless of design/color), so they all point at the same price
  // env var rather than needing 4 separate Stripe Price objects.
  "hat-fistbump-cream": {
    priceEnvVar: "STRIPE_PRICE_HAT_CLASSIC",
    returnPath: "/merch",
    thankYouPath: "/merch/thank-you",
    mode: "payment",
    shipping: true,
    merchColor: "hat-fistbump-cream",
  },
  "hat-fistbump-black": {
    priceEnvVar: "STRIPE_PRICE_HAT_CLASSIC",
    returnPath: "/merch",
    thankYouPath: "/merch/thank-you",
    mode: "payment",
    shipping: true,
    merchColor: "hat-fistbump-black",
  },
  "hat-upsidedown-cream": {
    priceEnvVar: "STRIPE_PRICE_HAT_CLASSIC",
    returnPath: "/merch",
    thankYouPath: "/merch/thank-you",
    mode: "payment",
    shipping: true,
    merchColor: "hat-upsidedown-cream",
  },
  "hat-upsidedown-black": {
    priceEnvVar: "STRIPE_PRICE_HAT_CLASSIC",
    returnPath: "/merch",
    thankYouPath: "/merch/thank-you",
    mode: "payment",
    shipping: true,
    merchColor: "hat-upsidedown-black",
  },
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

  // Presale scarcity check — block new checkouts once a colorway hits its cap.
  // This is a "don't open checkout at all" gate, not the source of truth for
  // preventing a double-sell on a race (that's session_id's UNIQUE constraint
  // in merch_orders, enforced in the webhook) — good enough for a presale at
  // this volume, where two people buying the literal last hat in the same
  // second is a real possibility we're fine handling by refunding one.
  if (productConfig.merchColor && productConfig.merchCap) {
    const sold = await countMerchOrders(env, productConfig.merchColor);
    if (sold >= productConfig.merchCap) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${origin}${productConfig.returnPath}?sold_out=${productConfig.merchColor}` },
      });
    }
  }

  try {
    const session = await createCheckoutSession(env, {
      priceId,
      mode: productConfig.mode,
      successUrl: `${origin}${productConfig.thankYouPath}`,
      cancelUrl: `${origin}${productConfig.returnPath}?purchase=canceled`,
      customerEmail: email,
      metadata: productConfig.merchColor ? { product, color: productConfig.merchColor } : { product },
      collectShipping: productConfig.shipping,
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
