import { findWorkshopDate, isBookable } from "../../data/workshop";
import type { APIContext } from "astro";
import { createCheckoutSession, getOrCreateKitAddonPrice } from "../../lib/stripe";
import { kitAddon as findKitAddon } from "../../lib/offers";
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
    // Which HAT_CATALOG/SHIRT_CATALOG key this is — used to look up the addon
    // surcharge and to stamp Stripe metadata.color for the webhook. No cap
    // enforcement anymore: everything ships print-to-order from Printful, so
    // there's no fixed inventory to sell out of (see lib/db.ts's
    // countMerchOrders comment for the removed presale-cap history).
    merchColor?: string;
    // Shows a promo-code entry field on Stripe's hosted Checkout page — only
    // set on products that actually have a live Coupon/Promotion Code to
    // redeem (e.g. SHOWUP, the welcome-postcard code for Spit-Up Society).
    allowPromotionCodes?: boolean;
  }
> = {
  "prep-kit": {
    priceEnvVar: "STRIPE_PRICE_PREP_KIT",
    returnPath: "/kit",
    thankYouPath: "/kit/thank-you",
    mode: "payment",
  },
  // Prep Kit add-ons, sold on their own too (added 2026-10-19). The usual
  // way in is the $17 checkbox at kit checkout (?product=prep-kit&addon=1,
  // see ADDON_IMAGES below); these standalone entries are for people who only want
  // one piece, e.g. a partner buying Her Copy. Priced inline, no env vars.
  "her-copy": {
    priceData: { name: "Her Copy: The Prep Kit, Partner Edition", unitAmountCents: 1900, image: "/images/addons/her-copy.jpg" },
    returnPath: "/kit/extras",
    thankYouPath: "/kit/thank-you",
    mode: "payment",
  },
  "delivery-pack": {
    priceData: { name: "The Delivery Room Pack", unitAmountCents: 1200, image: "/images/addons/delivery-pack.jpg" },
    returnPath: "/kit/extras",
    thankYouPath: "/kit/thank-you",
    mode: "payment",
  },
  // Game Plan Call: 45 min on Google Meet with John or Mike. $200 list.
  // Kit buyers normally get it as the one-click $97 offer on the thank-you
  // page (api/upsell-call.ts); "game-plan-call-kit" is the same $97 price
  // for owners who come back later via the link on page 31 of the kit.
  "game-plan-call": {
    priceData: { name: "Game Plan Call with John or Mike (includes the Prep Kit, Her Copy and Delivery Room Pack)", unitAmountCents: 20000 },
    returnPath: "/call",
    thankYouPath: "/call/thank-you",
    mode: "payment",
  },
  "game-plan-call-kit": {
    priceData: { name: "Game Plan Call with John or Mike (Prep Kit owner price)", unitAmountCents: 9700 },
    returnPath: "/call/kit",
    thankYouPath: "/call/thank-you",
    mode: "payment",
  },
  // The Dudela Workshop (live small group, first Thursdays). Needs a
  // ?date=YYYY-MM-DD that matches src/data/workshop.ts — checked in GET below.
  "workshop": {
    priceEnvVar: "STRIPE_PRICE_WORKSHOP",
    returnPath: "/workshop",
    thankYouPath: "/workshop/thank-you",
    mode: "payment",
  },
  "spit-up-society": {
    priceEnvVar: "STRIPE_PRICE_SPIT_UP_SOCIETY",
    returnPath: "/join/spit-up-society",
    thankYouPath: "/join/spit-up-society/thank-you",
    mode: "subscription",
    allowPromotionCodes: true,
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
        allowPromotionCodes: true,
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
        allowPromotionCodes: true,
      },
    ])
  ),
  // Sticker 5-pack — one fixed SKU, no HAT_CATALOG/SHIRT_CATALOG entry (no
  // color/size variants). merchColor is reused here purely to stamp
  // metadata.color = "sticker-5pack" for the webhook (see stripe-webhook.ts's
  // isMerch branch) — getHatVariant("sticker-5pack") below safely returns
  // undefined, so the addon-surcharge logic just no-ops for this product.
  //
  // $20 (raised from a $15 placeholder, 2026-09-01) — real cost is 5 x
  // $2.34/sticker = $11.70 (confirmed Printful rate) + $0.31 retail delivery
  // fee, no file digitization (kiss-cut print, not embroidery, per John
  // 2026-09-01). Shipping for a sticker-only package is still unconfirmed —
  // using the $4.69 single-item rate from real hat/shirt orders as a
  // conservative stand-in (a small/light sticker mailer should ship for
  // *less* than that, so this only overstates cost) — place one real sticker
  // order and check Orders → order detail once this is live, then revisit.
  //
  // CORRECTED 2026-09-01: the stripe-webhook.ts isStickerPack branch always
  // adds a free welcome postcard to every sticker order (unconditionally —
  // there's no discount-threshold check here since promo codes are already
  // blocked below), which the profit math above originally missed. Real
  // postcard cost is $1.53 (confirmed from Printful's own product page, not
  // a guess). With that included: $11.70 + $1.53 + $0.31 + $4.69 = $18.23
  // cost, Stripe fee $0.88 on $20 → ~$0.89 profit (~4.5% margin), not the
  // ~$2.42 (~12%) first estimated. Still profitable, just much thinner —
  // worth a second look (raise the price, drop the postcard from sticker
  // orders, or accept it once real shipping cost is confirmed).
  //
  // allowPromotionCodes is deliberately OFF (unlike hats/shirts) — at
  // $11.70+ in real product cost alone, this SKU can't survive FAMILY50
  // (50% off) at any price a sticker pack should reasonably charge, so
  // rather than chase an unreasonably high price to "breakeven with the
  // sales" (John's instruction, 2026-09-01), no promo code ever applies
  // here — full price every time, same logic as the bundle checkout above.
  "sticker-5pack": {
    priceData: {
      name: "Dudela Sticker 5-Pack",
      unitAmountCents: 2000,
      image: "/images/sticker/sticker-flat.png",
    },
    returnPath: "/merch",
    thankYouPath: "/merch/thank-you",
    mode: "payment" as const,
    shipping: true,
    merchColor: "sticker-5pack",
    allowPromotionCodes: false,
  },
};

// Buy a hat + shirt together and get 15% off each — see /merch's "Bundle &
// Save" section. Not a PRODUCTS entry above since it's parameterized by
// TWO catalog picks (?hat=<HAT_CATALOG key>&shirt=<SHIRT_CATALOG key>), not
// one fixed product — handled in its own branch (handleBundleCheckout)
// below instead. A flat percentage off each item's own price, applied as
// two separate discounted line items (not a Stripe Coupon on top of full
// price), so the checkout page and the resulting receipt itemize each
// piece at its real discounted price rather than one opaque combined charge.
//
// allowPromotionCodes is deliberately OFF for the bundle (see below) — the
// bundle's own 15% is the one and only discount it ever gets. Before
// 2026-08-31 a customer could also type FAMILY50/HUDDLE20 into Stripe's
// checkout field and stack it on top of the already-discounted bundle price
// (15% x 50% compounding to ~32% off), which real order costs showed pushed
// bundle profit to -$14 to -$18 (see the Dudela Ledger's Coupon Comparison).
// One discount only, whichever applies — never both.
const BUNDLE_DISCOUNT_PERCENT = 15;

// Fallback Stripe Price ids for products whose env var hasn't been added in
// the Cloudflare dashboard yet. Price ids aren't secret (they're visible in
// every Checkout URL), so a code fallback is safe; the env var still wins.
// Prep Kit checkout add-ons (Her Copy, Delivery Room Pack, or both for $17)
// ride along as a second line item when the buyer ticks them on /kit or
// /get-the-kit (?addon=her|pack|both). Prices live in lib/offers.ts.
// metadata.addon tells the webhook which downloads to include.
const ADDON_IMAGES: Record<string, string> = {
  both: "/images/addons/addon-bundle.jpg",
  her: "/images/addons/her-copy.jpg",
  pack: "/images/addons/delivery-pack.jpg",
};

const PRICE_ID_FALLBACKS: Record<string, string> = {
  STRIPE_PRICE_WORKSHOP: "price_1URFfyI01jg8VCLkxBFm2nAW", // The Dudela Workshop, $147 (created 2026-10-16)
};

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
    priceId = env[productConfig.priceEnvVar] || PRICE_ID_FALLBACKS[productConfig.priceEnvVar];
    if (!priceId) {
      console.error(`Missing env var ${productConfig.priceEnvVar} for product "${product}"`);
      return new Response("Checkout is temporarily unavailable. Try again shortly.", { status: 500 });
    }
  } else if (!productConfig.priceData) {
    console.error(`Product "${product}" has neither priceEnvVar nor priceData configured`);
    return new Response("Checkout is temporarily unavailable. Try again shortly.", { status: 500 });
  }

  // Workshop seats are per date — reject a missing, unknown, or past date
  // rather than charging for a session that isn't on the calendar.
  let workshopDate: string | undefined;
  let submitMessage: string | undefined;
  if (product === "workshop") {
    const d = findWorkshopDate(url.searchParams.get("date"));
    if (!d || !isBookable(d.iso)) {
      return Response.redirect(`${origin}/workshop#dates`, 303);
    }
    workshopDate = d.iso;
    submitMessage = `Your seat: ${d.label}, 7:00–8:30pm MT on Zoom. Your Zoom link arrives by email before the session.`;
  }

  // No scarcity/sold-out gate here — every hat and shirt is print-to-order
  // through Printful (no fixed stock to run out of), so checkout stays open
  // for any catalog variant at any volume.

  // The $1 Dude to Dad side-stitch add-on is its own Stripe line item (see
  // lib/stripe.ts) rather than a separate $39 Price object per hat variant —
  // added here, not baked into priceId, so the base hat price stays a single
  // shared Stripe Price across all 28 variants.
  const hatVariant = productConfig.merchColor ? getHatVariant(productConfig.merchColor) : undefined;
  const addonParam = url.searchParams.get("addon");
  const addonKey = addonParam === "1" ? "both" : addonParam || "";
  const kitAddon = product === "prep-kit" ? findKitAddon(addonKey) : undefined;
  const extraLineItems = hatVariant?.addon
    ? [{ name: 'Dude to Dad Stitch', unitAmountCents: 100 }]
    : kitAddon
      ? [{ name: kitAddon.name, unitAmountCents: kitAddon.cents, images: [`${origin}${ADDON_IMAGES[addonKey]}`] }]
      : undefined;

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

  // Prep Kit (without a ?addon= already chosen): offer the $17 add-on with
  // Stripe's own "Add to order" button on the checkout page. If creating the
  // Price fails for any reason, checkout still works without the offer.
  let optionalPriceIds: string[] | undefined;
  if (product === "prep-kit" && !kitAddon) {
    try {
      optionalPriceIds = [await getOrCreateKitAddonPrice(env, `${origin}${ADDON_IMAGES.both}`)];
    } catch (err) {
      console.error("Kit add-on price unavailable, continuing without it:", err);
    }
  }

  try {
    const session = await createCheckoutSession(env, {
      priceId,
      priceData,
      optionalPriceIds,
      mode: productConfig.mode,
      successUrl: `${origin}${productConfig.thankYouPath}?session_id={CHECKOUT_SESSION_ID}`,
      submitMessage,
      cancelUrl: `${origin}${productConfig.returnPath}?purchase=canceled`,
      customerId: existingCustomerId,
      customerEmail: existingCustomerId ? undefined : email,
      metadata: {
        ...(productConfig.merchColor
          ? { product, color: productConfig.merchColor }
          : workshopDate
            ? { product, sessionDate: workshopDate }
            : { product }),
        ...(kitAddon ? { addon: addonKey } : {}),
        ...metaMatchData(request, cookies),
      },
      collectShipping: productConfig.shipping,
      // Only relevant for one-time purchases (subscriptions already invoice
      // automatically) — generates a real Stripe Invoice for the purchase so
      // it actually shows up in the Billing Portal's invoice history instead
      // of being an invisible PaymentIntent the portal has nothing to display.
      invoiceCreation: productConfig.mode === "payment",
      extraLineItems,
      allowPromotionCodes: productConfig.allowPromotionCodes,
      // Prep Kit saves the card so the thank-you page can offer the Game
      // Plan Call as a one-click add (see api/upsell-call.ts).
      saveCardForLater: product === "prep-kit",
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
      // No promo-code field on bundle checkout — see the BUNDLE_DISCOUNT_PERCENT
      // comment above. The bundle's 15% is already applied to hatCents/shirtCents.
      allowPromotionCodes: false,
    });
    return new Response(null, { status: 302, headers: { Location: session.url } });
  } catch (err) {
    console.error("Bundle checkout session creation failed:", err);
    return new Response("Checkout is temporarily unavailable. Try again shortly.", { status: 500 });
  }
}

// Browser identifiers Meta uses to match a server-side Purchase back to the
// ad click (see lib/meta-capi.ts). Carried through Stripe metadata because the
// webhook never sees the buyer's browser. Stripe caps values at 500 chars.
function metaMatchData(request: Request, cookies: any): Record<string, string> {
  const out: Record<string, string> = {};
  const fbp = cookies.get("_fbp")?.value;
  const fbc = cookies.get("_fbc")?.value;
  const ip = request.headers.get("cf-connecting-ip");
  const ua = request.headers.get("user-agent");
  const src = request.headers.get("referer");
  if (fbp) out.fbp = fbp.slice(0, 500);
  if (fbc) out.fbc = fbc.slice(0, 500);
  if (ip) out.ip = ip.slice(0, 500);
  if (ua) out.ua = ua.slice(0, 500);
  if (src) out.src = src.split("?")[0].slice(0, 500);
  return out;
}
