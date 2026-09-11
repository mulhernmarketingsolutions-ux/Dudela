import type { APIContext } from "astro";
import { createCheckoutSession } from "../../lib/stripe";
import { getAuthedMember } from "../../lib/auth";
import { getHatVariant, hatLabel, getShirtVariant, shirtLabel, BUNDLE_DISCOUNT_PERCENT } from "../../lib/printful";

export const prerender = false;

// A general cart checkout — buy any mix of hats/shirts/sticker packs, any
// quantities, any combination of variants, in ONE Stripe Checkout Session.
// Sits alongside (doesn't replace) the single-item GET flow in
// create-checkout-session.ts — that route still powers every card's direct
// "Buy Now" button (fastest path for a one-item purchase); this one powers
// the cart drawer on /merch (see merch.astro's cart JS) once a buyer has
// added more than they'd want to check out one at a time.
//
// POST, not GET+query params, because a cart's contents (an arbitrary list
// of {key, qty} pairs) don't fit cleanly in a URL the way one product key
// does — the client posts JSON and gets back { url } to redirect to,
// instead of being redirected directly.
//
// Fulfillment for product="cart" lives in stripe-webhook.ts, in its own
// isCart branch — it decodes metadata.cart the same way this file encodes
// it below. That metadata is built from `resolved` (real key/qty, BEFORE
// any bundle split) — the bundle discount only ever affects how Stripe line
// items get priced/split, never what gets shipped, so the webhook doesn't
// need to know a bundle applied at all.

// Stripe caps every metadata VALUE at 500 characters. metadata.cart is a
// JSON array of [key, qty] tuples — a shirt key like
// "shirt-dad-est-black-2024-m" plus its qty comes to roughly 35-40 chars
// once JSON-encoded, so 10 distinct lines (~400 chars) stays comfortably
// under that with room for less compact keys. This isn't "10 items max" —
// qty per line can be anything reasonable — just 10 distinct variant/product
// combinations in one order, which covers "a few different shirt years/
// colors" with real headroom.
const MAX_CART_LINES = 10;
const MAX_QTY_PER_LINE = 20;

interface CartLine {
  key: string;
  qty: number;
}

type Category = "hat" | "shirt" | "sticker";

interface ResolvedLine {
  key: string;
  category: Category;
  name: string;
  unitAmountCents: number;
  image?: string;
  qty: number;
  // Whether promo codes must stay off for this whole checkout — true for
  // the sticker pack (see create-checkout-session.ts's PRODUCTS comment:
  // it can't survive a 50%-off code at any reasonable price).
  blocksPromo: boolean;
}

function resolveLine(key: string, qty: number, origin: string): ResolvedLine | null {
  if (key === "sticker-5pack") {
    return {
      key,
      category: "sticker",
      name: "Dudela Sticker 5-Pack",
      unitAmountCents: 2000,
      image: `${origin}/images/sticker/sticker-flat.png`,
      qty,
      blocksPromo: true,
    };
  }
  const hat = getHatVariant(key);
  if (hat) {
    // The $1 "Dude to Dad" stitch add-on is folded straight into this
    // line's own unit price (unlike the single-item checkout, which adds
    // it as a separate Stripe line item) — a cart line already represents
    // "qty of this exact variant," and the add-on is part of what makes it
    // that exact variant, not a separate purchasable thing.
    const unitAmountCents = Math.round((parseFloat(hat.price) + (hat.addon ? 1 : 0)) * 100);
    return {
      key,
      category: "hat",
      name: hatLabel(hat) + (hat.addon ? " + Dude to Dad Stitch" : ""),
      unitAmountCents,
      image: hat.frontImage ? `${origin}${hat.frontImage}` : undefined,
      qty,
      blocksPromo: false,
    };
  }
  const shirt = getShirtVariant(key);
  if (shirt) {
    return {
      key,
      category: "shirt",
      name: shirtLabel(shirt),
      unitAmountCents: Math.round(parseFloat(shirt.price) * 100),
      image: shirt.frontImage ? `${origin}${shirt.frontImage}` : undefined,
      qty,
      blocksPromo: false,
    };
  }
  return null;
}

export async function POST({ request, locals, cookies }: APIContext) {
  const env = (locals as any).runtime.env;
  const origin = new URL(request.url).origin;

  let payload: { items?: CartLine[]; email?: string };
  try {
    payload = await request.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  if (rawItems.length === 0) {
    return new Response("Cart is empty", { status: 400 });
  }
  if (rawItems.length > MAX_CART_LINES) {
    return new Response(`Too many distinct items in one order (max ${MAX_CART_LINES}) — split into two orders.`, {
      status: 400,
    });
  }

  const resolved: ResolvedLine[] = [];
  for (const raw of rawItems) {
    const qty = Math.floor(Number(raw.qty));
    if (!raw.key || !Number.isFinite(qty) || qty < 1 || qty > MAX_QTY_PER_LINE) {
      return new Response(`Invalid cart line: ${JSON.stringify(raw)}`, { status: 400 });
    }
    const line = resolveLine(String(raw.key), qty, origin);
    if (!line) {
      return new Response(`Unknown product in cart: "${raw.key}"`, { status: 400 });
    }
    resolved.push(line);
  }

  const member = await getAuthedMember(cookies, env);
  const existingCustomerId = member?.stripe_customer_id || undefined;

  // Bundle & Save, folded into the cart (replaces the old standalone
  // ?product=bundle checkout — see create-checkout-session.ts's
  // handleBundleCheckout, which is now unreferenced by the UI but left in
  // place rather than deleted): whenever the cart holds at least one hat
  // AND at least one shirt, exactly ONE of each gets the same 15% off each
  // the old bundle bar gave — same rate, same "one hat + one shirt" scope
  // (not every pair), same "no promo code on top" rule. Extra units beyond
  // that first hat/shirt stay full price.
  //
  // The catalog's own `resolved` list (real key/qty, used for metadata +
  // Printful fulfillment below) is untouched by this — only the SEPARATE
  // Stripe line items built just below can differ from `resolved` (a
  // bundle-eligible line with qty > 1 splits into a discounted qty-1 line
  // + a full-price remainder line for the same key).
  const hatLineIdx = resolved.findIndex((l) => l.category === "hat");
  const shirtLineIdx = resolved.findIndex((l) => l.category === "shirt");
  const bundleEligible = hatLineIdx !== -1 && shirtLineIdx !== -1;

  const stripeItems: { name: string; unitAmountCents: number; images?: string[]; quantity: number }[] = [];
  resolved.forEach((line, i) => {
    if (bundleEligible && (i === hatLineIdx || i === shirtLineIdx)) {
      const isHat = i === hatLineIdx;
      // Re-derive from the catalog (not from line.unitAmountCents) so the
      // 15% only ever applies to the base garment price — the $1 hat
      // add-on surcharge stays full price, matching the original
      // standalone Bundle checkout's math exactly. resolveLine() only ever
      // produces a "hat"/"shirt" category line when the catalog lookup
      // succeeded, so the non-null assertions below are safe.
      const hatVariant = isHat ? getHatVariant(line.key) : undefined;
      const shirtVariant = isHat ? undefined : getShirtVariant(line.key);
      const basePriceCents = isHat
        ? Math.round(parseFloat(hatVariant!.price) * 100)
        : Math.round(parseFloat(shirtVariant!.price) * 100);
      const addonCents = isHat && hatVariant?.addon ? 100 : 0;
      const discountedUnitCents = Math.round(basePriceCents * (1 - BUNDLE_DISCOUNT_PERCENT / 100)) + addonCents;
      const fullUnitCents = basePriceCents + addonCents;

      stripeItems.push({
        name: `${line.name} (Bundle -${BUNDLE_DISCOUNT_PERCENT}%)`,
        unitAmountCents: discountedUnitCents,
        images: line.image ? [line.image] : undefined,
        quantity: 1,
      });
      if (line.qty > 1) {
        stripeItems.push({
          name: line.name,
          unitAmountCents: fullUnitCents,
          images: line.image ? [line.image] : undefined,
          quantity: line.qty - 1,
        });
      }
    } else {
      stripeItems.push({
        name: line.name,
        unitAmountCents: line.unitAmountCents,
        images: line.image ? [line.image] : undefined,
        quantity: line.qty,
      });
    }
  });

  // Same logic as create-checkout-session.ts's sticker-5pack entry (any
  // sticker line blocks promo codes entirely) PLUS the original Bundle
  // rule: a bundle-discounted order never also takes a promo code on top —
  // that's the exact stacking bug the standalone Bundle checkout was built
  // to prevent in the first place (see create-checkout-session.ts's
  // BUNDLE_DISCOUNT_PERCENT comment).
  const allowPromotionCodes = !resolved.some((l) => l.blocksPromo) && !bundleEligible;

  // Compact [key, qty] tuples (not {key, qty} objects) to leave more room
  // under Stripe's 500-char metadata value cap — see MAX_CART_LINES above.
  // Built from `resolved`, NOT `stripeItems` — a bundle split changes how
  // many Stripe line items exist, never the real per-key quantity ordered.
  // stripe-webhook.ts's isCart branch decodes this exact shape back out.
  const cartMetadata = JSON.stringify(resolved.map((l) => [l.key, l.qty]));
  if (cartMetadata.length > 500) {
    return new Response("Cart is too large to encode for checkout — remove a few lines and try again.", {
      status: 400,
    });
  }

  try {
    const session = await createCheckoutSession(env, {
      items: stripeItems,
      mode: "payment",
      successUrl: `${origin}/merch/thank-you`,
      cancelUrl: `${origin}/merch?purchase=canceled`,
      customerId: existingCustomerId,
      customerEmail: existingCustomerId ? undefined : payload.email,
      metadata: { product: "cart", cart: cartMetadata },
      collectShipping: true,
      invoiceCreation: true,
      allowPromotionCodes,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Cart checkout session creation failed:", err);
    return new Response("Checkout is temporarily unavailable. Try again shortly.", { status: 500 });
  }
}
