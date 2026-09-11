import type { APIContext } from "astro";
import { createCheckoutSession } from "../../lib/stripe";
import { getAuthedMember } from "../../lib/auth";
import { getHatVariant, hatLabel, getShirtVariant, shirtLabel } from "../../lib/printful";

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
// isCart branch — it decodes metadata.cart (see CART_METADATA_LIMIT below)
// the same way this file encodes it.

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

interface ResolvedLine {
  key: string;
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

  // Same logic as create-checkout-session.ts's sticker-5pack entry — any
  // sticker line in the cart means no promo code on this checkout at all,
  // full price every time, same as buying stickers alone.
  const allowPromotionCodes = !resolved.some((l) => l.blocksPromo);

  // Compact [key, qty] tuples (not {key, qty} objects) to leave more room
  // under Stripe's 500-char metadata value cap — see MAX_CART_LINES above.
  // stripe-webhook.ts's isCart branch decodes this exact shape back out.
  const cartMetadata = JSON.stringify(resolved.map((l) => [l.key, l.qty]));
  if (cartMetadata.length > 500) {
    return new Response("Cart is too large to encode for checkout — remove a few lines and try again.", {
      status: 400,
    });
  }

  try {
    const session = await createCheckoutSession(env, {
      items: resolved.map((l) => ({
        name: l.name,
        unitAmountCents: l.unitAmountCents,
        images: l.image ? [l.image] : undefined,
        quantity: l.qty,
      })),
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
