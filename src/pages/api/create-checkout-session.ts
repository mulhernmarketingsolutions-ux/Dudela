import type { APIContext } from "astro";
import { createCheckoutSession } from "../../lib/stripe";
import { countMerchOrders } from "../../lib/db";
import { getAuthedMember } from "../../lib/auth";
import { HAT_CATALOG, getHatVariant, hatLabel, SHIRT_CATALOG, getShirtVariant, shirtLabel } from "../../lib/printful";

export const prerender = false;

// Buy buttons on product pages hit this route (GET, e.g. /api/create-checkout-session?product=prep-kit),
// it creates a Stripe Checkout Session for the right price, and redirects the buyer straight
// to Stripe's hosted checkout page. On success, Stripe redirects back to `successUrl`; the actual
// purchase confirmation + Loops tagging happens in /api/stripe-webhook.ts once Stripe's webhook
// fires — never trust the redirect alone, since a buyer can close the tab before it happens.
//
// Required Cloudflare secrets: STRIPE_SECRET_KEY (see lib/stripe.ts), plus a STRIPE_PRICE_*
// var for each product still using priceEnvVar below (prep-kit, spit-up-society) — merch
// (hats/shirts) is priced inline via priceData instead, see the PRODUCTS type comment.
const PRODUCTS: Record<
  string,
  {
    // Exactly one of these is set. priceEnvVar = a pre-created Stripe Price
    // object (id stored as a Cloudflare env var, see lib/stripe.ts).
    // priceData = inline Stripe price_data, used for merch so every variant
    // can show its own real product photo at Stripe Checkout and on the
    // receipt (a single shared Price object, as hats used before, can only
    // ever show one image for all 28 color/thread/add-on combos — wrong for
    // 27 of them). `image` is a relative /images/... path, resolved to an
    // absolute thedudelaco.com URL below since Stripe fetches it itself.
    priceEnvVar?: string;
    priceData?: { name: string; unitAmountCents: number; image?: string };
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
  // Every buyable hat — see lib/printful.ts HAT_CATALOG, the single source of
  // truth for the real (design, thread color, add-on, cap color) combos
  // Printful actually has built as sync products. Priced via inline
  // priceData (not a shared Stripe Price env var, despite every variant
  // costing the same $38) specifically so each variant can carry its own
  // real frontImage — see the PRODUCTS type comment above.
  ...Object.fromEntries(
    HAT_CATALOG.map((hat) => [
      hat.key,
      {
        priceData: {
          name: hatLabel(hat),
          unitAmountCents: Math.round(parseFloat(hat.price) * 100),
          image: hat.frontImage,
        },
        returnPath: "/merch",
        thankYouPath: "/merch/thank-you",
        mode: "payment" as const,
        shipping: true,
        merchColor: hat.key,
      },
    ])
  ),
  // Every buyable shirt — see lib/printful.ts SHIRT_CATALOG.
  ...Object.fromEntries(
    SHIRT_CATALOG.map((shirt) => [
      shirt.key,
      {
        priceData: {
          name: shirtLabel(shirt),
          unitAmountCents: Math.round(parseFloat(shirt.price) * 100),
          image: shirt.frontImage,
        },
        returnPath: "/merch",
        thankYouPath: "/merch/thank-you",
        mode: "payment" as const,
        shipping: true,
        merchColor: shirt.key,
      },
    ])
  ),
};

// Buy a hat + shirt together and get 20% off each — see /merch's "Bundle &
// Save" section. Not a PRODUCTS entry above since it's parameterized by
// TWO catalog picks (?hat=<HAT_CATALOG key>&shirt=<SHIRT_CATALOG key>), not
// one fixed product — handled in its own branch (handleBundleCheckout)
// below instead. A flat percentage off each item's own price, applied as
// two separate discounted line items (not a Stripe Coupon on top of full
// price), so the checkout page and the resulting receipt itemize each
// piece at its real discounted price rather than one opaque combined charge.
const BUNDLE_DISCOUNT_PERCENT = 20;

export async function GET({ request, locals, cookies }: APIContext) {
  const env = (locals as any).runtime.env;
  const url = new URL(request.url);
  const product = url.searchParams.get("product") || "prep-kit";
  const email = url.searchParams.get("email") || undefined;
  const origin = url.origin;

  // If the buyer is already logged in as a Spit-Up Society member (e.g.
  // browsing /merch while signed in), attach this purchase to their existing
  // Stripe customer instead of letting Stripe spin up a brand-new, unrelated
  // guest customer. That's what makes a hat purchase show up in the same
  // Billing Portal as their membership — a guest checkout (not logged in)
  // still creates a separate customer, since Stripe collects the email on
  // its own hosted page, after this route has already run.
  const member = await getAuthedMember(cookies, env);
  const existingCustomerId = member?.stripe_customer_id || undefined;

  if (product === "bundle") {
    return handleBundleCheckout(env, url, origin, email, existingCustomerId);
  }

  const productConfig = PRODUCTS[product];
  if (!productConfig) {
    return new Response(`Unknown product "${product}"`, { status: 400 });
  }

  let priceId: string | undefined;
  if (productConfig.priceEnvVar) {
    priceId = env[productConfig.priceEnvVar];
    if (!priceId) {
      console.error(`Missing env var ${productConfig.priceEnvVar} for product "${product}"`);
      return new Response("Checkout is temporarily unavailable. Try again shortly.", { status: 500 });
    }
  } else if (!productConfig.priceData) {
    console.error(`Product "${product}" has neither priceEnvVar nor priceData configured`);
    return new Response("Checkout is temporarily unavailable. Try again shortly.", { status: 500 });
  }

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

  // The $1 Dude to Dad side-stitch add-on is its own Stripe line item (see
  // lib/stripe.ts) rather than a separate $39 Price object per hat variant —
  // added here, not baked into priceId, so the base hat price stays a single
  // shared Stripe Price across all 28 variants.
  const hatVariant = productConfig.merchColor ? getHatVariant(productConfig.merchColor) : undefined;
  const extraLineItems = hatVariant?.addon ? [{ name: 'Dude to Dad Stitch', unitAmountCents: 100 }] : undefined;

  // Stripe fetches the image itself, so it needs a real absolute https URL —
  // resolve the catalog's relative /images/... path against this request's
  // own origin rather than baking a hardcoded domain into the catalog data.
  const priceData = productConfig.priceData
    ? {
        name: productConfig.priceData.name,
        unitAmountCents: productConfig.priceData.unitAmountCents,
        images: productConfig.priceData.image ? [`${origin}${productConfig.priceData.image}`] : undefined,
      }
    : undefined;

  try {
    const session = await createCheckoutSession(env, {
      priceId,
      priceData,
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
      extraLineItems,
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

// Split out of GET above purely for readability — the bundle's inputs
// (two catalog keys instead of one PRODUCTS lookup) and pricing (20% off
// each item, computed here rather than read off a fixed PRODUCTS entry)
// are different enough from the single-product path that folding it into
// the same function body made both harder to follow.
async function handleBundleCheckout(
  env: any,
  url: URL,
  origin: string,
  email: string | undefined,
  existingCustomerId: string | undefined
): Promise<Response> {
  const hatKey = url.searchParams.get("hat") || "";
  const shirtKey = url.searchParams.get("shirt") || "";
  const hat = getHatVariant(hatKey);
  const shirt = getShirtVariant(shirtKey);
  if (!hat || !shirt) {
    return new Response(`Unknown bundle selection (hat="${hatKey}", shirt="${shirtKey}")`, { status: 400 });
  }

  const discountMultiplier = 1 - BUNDLE_DISCOUNT_PERCENT / 100;
  const hatCents = Math.round(parseFloat(hat.price) * 100 * discountMultiplier);
  const shirtCents = Math.round(parseFloat(shirt.price) * 100 * discountMultiplier);

  // Hat is the main (index 0) line item, shirt + the optional $1 add-on
  // surcharge ride along as extraLineItems — see lib/stripe.ts.
  const extraLineItems: Array<{ name: string; unitAmountCents: number; images?: string[] }> = [
    {
      name: `${shirtLabel(shirt)} (Bundle -${BUNDLE_DISCOUNT_PERCENT}%)`,
      unitAmountCents: shirtCents,
      images: [`${origin}${shirt.frontImage}`],
    },
  ];
  if (hat.addon) {
    extraLineItems.push({ name: "Dude to Dad Stitch", unitAmountCents: 100 });
  }

  try {
    const session = await createCheckoutSession(env, {
      priceData: {
        name: `${hatLabel(hat)} (Bundle -${BUNDLE_DISCOUNT_PERCENT}%)`,
        unitAmountCents: hatCents,
        images: [`${origin}${hat.frontImage}`],
      },
      mode: "payment",
      successUrl: `${origin}/merch/thank-you`,
      cancelUrl: `${origin}/merch?purchase=canceled`,
      customerId: existingCustomerId,
      customerEmail: existingCustomerId ? undefined : email,
      // No single `color` field — the webhook (stripe-webhook.ts) checks
      // for product === "bundle" and reads hatColor/shirtColor separately
      // to create two merch_orders rows and one combined Printful order.
      metadata: { product: "bundle", hatColor: hat.key, shirtColor: shirt.key },
      collectShipping: true,
      invoiceCreation: true,
      extraLineItems,
    });
    return new Response(null, { status: 302, headers: { Location: session.url } });
  } catch (err) {
    console.error("Bundle checkout session creation failed:", err);
    return new Response("Checkout is temporarily unavailable. Try again shortly.", { status: 500 });
  }
}
