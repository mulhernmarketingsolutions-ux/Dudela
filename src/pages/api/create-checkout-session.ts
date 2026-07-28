import type { APIContext } from "astro";
import { createCheckoutSession } from "../../lib/stripe";
import { countMerchOrders } from "../../lib/db";
import { getAuthedMember } from "../../lib/auth";

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
  // The 6 buyable hats (2 designs x 3 colors) — see lib/printful.ts HAT_CATALOG for
  // the design/color/thread config each of these slugs maps to. Dropped the
  // cream/green-bill colorway from both designs per John (greens didn't match,
  // and it's off his real Printful list) — down from 8 to 6. All six share one
  // $38 Stripe price (same physical cost regardless of design/color), so they all
  // point at the same price env var rather than needing separate Stripe Price objects.
  ...Object.fromEntries(
    [
      "hat-fistbump-cream",
      "hat-fistbump-black",
      "hat-fistbump-white",
      "hat-upsidedown-black",
      "hat-upsidedown-white",
      "hat-upsidedown-blackbill",
    ].map((slug) => [
      slug,
      {
        priceEnvVar: "STRIPE_PRICE_HAT_CLASSIC",
        returnPath: "/merch",
        thankYouPath: "/merch/thank-you",
        mode: "payment" as const,
        shipping: true,
        merchColor: slug,
      },
    ])
  ),
};

export async function GET({ request, locals, cookies }: APIContext) {
  const env = (locals as any).runtime.env;
  const url = new URL(request.url);
  const product = url.searchParams.get("product") || "prep-kit";
  const email = url.searchParams.get("email") || undefined;

  // If the buyer is already logged in as a Spit-Up Society member (e.g.
  // browsing /merch while signed in), attach this purchase to their existing
  // Stripe customer instead of letting Stripe spin up a brand-new, unrelated
  // guest customer. That's what makes a hat purchase show up in the same
  // Billing Portal as their membership — a guest checkout (not logged in)
  // still creates a separate customer, since Stripe collects the email on
  // its own hosted page, after this route has already run.
  const member = await getAuthedMember(cookies, env);
  const existingCustomerId = member?.stripe_customer_id || undefined;

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
      customerId: existingCustomerId,
      customerEmail: existingCustomerId ? undefined : email,
      metadata: productConfig.merchColor ? { product, color: productConfig.merchColor } : { product },
      collectShipping: productConfig.shipping,
      // Only relevant for one-time purchases (subscriptions already invoice
      // automatically) — generates a real Stripe Invoice for the purchase so
      // it actually shows up in the Billing Portal's invoice history instead
      // of being an invisible PaymentIntent the portal has nothing to display.
      invoiceCreation: productConfig.mode === "payment",
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
