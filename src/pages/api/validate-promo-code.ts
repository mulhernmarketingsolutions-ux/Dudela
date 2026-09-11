import type { APIContext } from "astro";
import { lookupPromotionCode } from "../../lib/stripe";

export const prerender = false;

// Powers the promo-code field baked into the /merch cart drawer (see
// merch.astro's cart JS) — a buyer types a code, this validates it against
// Stripe right there and the drawer shows the real discount before they
// ever leave the page, instead of only finding out on Stripe's hosted
// checkout page. This is a PREVIEW only: create-cart-checkout-session.ts
// re-looks-up the same code itself right before creating the Stripe
// session — never trust this endpoint's answer for the actual charge, a
// client can call it with anything.
export async function POST({ request, locals }: APIContext) {
  const env = (locals as any).runtime.env;

  let payload: { code?: string };
  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ valid: false }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const code = typeof payload.code === "string" ? payload.code : "";
  if (!code.trim()) {
    return new Response(JSON.stringify({ valid: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const promo = await lookupPromotionCode(env, code);
    if (!promo) {
      return new Response(JSON.stringify({ valid: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ valid: true, ...promo }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("validate-promo-code failed:", err);
    return new Response(JSON.stringify({ valid: false, error: "lookup_failed" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}
