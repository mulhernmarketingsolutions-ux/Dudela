import type { APIContext } from "astro";
import { retrieveCheckoutSession, chargeSavedCard, createCheckoutSession } from "../../lib/stripe";
import { claimWebhookEvent } from "../../lib/db";
import { sendEmail } from "../../lib/email";
import { sendLoopsPurchaseEvent } from "../../lib/loops";
import { sendMetaPurchase } from "../../lib/meta-capi";
import { PRODUCTS, receiptEmailHtml, notifyEmailHtml } from "./stripe-webhook";
import { CALL } from "../../lib/offers";

export const prerender = false;

// One-click Game Plan Call ($97) from the Prep Kit thank-you page (added
// 2026-10-19). The kit checkout saved the buyer's card (setup_future_usage,
// see create-checkout-session.ts), so this charges that card directly. No
// second card entry. Everything is checked server-side against Stripe:
// the browser only sends the session id from its own success URL.
//
// If the bank wants extra verification (or the card declines), we fall back
// to a normal Stripe Checkout page for the same $97 product, and the regular
// webhook handles delivery from there.
//
// Side effects (receipt, notify, Loops, Meta) are guarded by claimWebhookEvent
// with a synthetic id, and the charge itself by a Stripe Idempotency-Key, so a
// double click can never charge or email twice.
export async function POST({ request, locals }: APIContext) {
  const env = (locals as any).runtime.env;
  const url = new URL(request.url);
  let sessionId = "";
  try {
    sessionId = String(((await request.json()) as any)?.session_id || "");
  } catch {}
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
    return json({ ok: false, error: "Missing purchase reference." }, 400);
  }

  let session: any;
  try {
    session = await retrieveCheckoutSession(env, sessionId);
  } catch (err) {
    console.error("upsell-call: session lookup failed", err);
    return json({ ok: false, error: "We couldn't find your order. Try again in a moment." }, 400);
  }
  if (session.payment_status !== "paid" || session.metadata?.product !== "prep-kit") {
    return json({ ok: false, error: "This offer is only for Prep Kit orders." }, 400);
  }
  // Only valid for a few hours after the kit purchase.
  if (Date.now() / 1000 - (session.created || 0) > 6 * 3600) {
    return json({ ok: false, redirect: `${url.origin}/call/kit` });
  }

  const email: string = session.customer_details?.email || "";
  const name: string = session.customer_details?.name || "";
  const customerId: string | undefined = typeof session.customer === "string" ? session.customer : session.customer?.id;
  const pm = session.payment_intent?.payment_method;
  const paymentMethodId: string | undefined = typeof pm === "string" ? pm : pm?.id;

  const fallback = async () => {
    const co = await createCheckoutSession(env, {
      priceData: { name: "Game Plan Call with John or Mike (Prep Kit owner price)", unitAmountCents: CALL.kitPriceCents },
      mode: "payment",
      successUrl: `${url.origin}/call/thank-you?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${url.origin}/kit/thank-you?session_id=${sessionId}`,
      customerId,
      customerEmail: customerId ? undefined : email || undefined,
      metadata: { product: "game-plan-call-kit", fromKitSession: sessionId },
      invoiceCreation: true,
    });
    return json({ ok: false, redirect: co.url });
  };

  if (!customerId || !paymentMethodId) {
    return fallback();
  }

  let pi: any;
  try {
    pi = await chargeSavedCard(env, {
      customerId,
      paymentMethodId,
      amountCents: CALL.kitPriceCents,
      description: "Game Plan Call (Prep Kit owner price)",
      receiptEmail: email || undefined,
      metadata: { product: "game-plan-call-kit", fromKitSession: sessionId },
      idempotencyKey: `upsell-call-${sessionId}`,
    });
  } catch (err: any) {
    console.error("upsell-call: off-session charge failed", err?.code, err?.message);
    try {
      return await fallback();
    } catch (e) {
      console.error("upsell-call: fallback checkout failed", e);
      return json({ ok: false, error: "Something went wrong. Your card was not charged." }, 500);
    }
  }

  const isFirst = await claimWebhookEvent(env, `upsell-call:${sessionId}`);
  if (isFirst && email) {
    const isTest = pi.livemode === false;
    const prefix = isTest ? "[TEST] " : "";
    const productInfo = PRODUCTS["game-plan-call-kit"];
    const tasks: Promise<unknown>[] = [
      sendEmail(env, { to: email, subject: `${prefix}Your Game Plan Call: pick your time`, html: receiptEmailHtml(name, productInfo) }),
      sendEmail(env, {
        to: env.NOTIFY_EMAIL || "dude@thedudelaco.com",
        subject: `${prefix}New Game Plan Call (one-click) — ${email}`,
        html: notifyEmailHtml({ email, name, product: "game-plan-call-kit", productLabel: "Game Plan Call (one-click after the kit)", amount: "$97.00", event: "New purchase" }),
        replyTo: email,
      }),
      sendLoopsPurchaseEvent(env, { email, name, product: "game-plan-call-kit" }),
      sendMetaPurchase(env, {
        eventId: pi.id,
        email,
        name,
        value: CALL.kitPriceCents / 100,
        currency: "usd",
        product: "game-plan-call-kit",
        fbp: session.metadata?.fbp,
        fbc: session.metadata?.fbc,
        ip: session.metadata?.ip,
        userAgent: session.metadata?.ua,
        sourceUrl: session.metadata?.src,
      }),
    ];
    const results = await Promise.allSettled(tasks);
    results.forEach((r, i) => r.status === "rejected" && console.error(`upsell-call side effect ${i} failed:`, r.reason));
  }

  return json({ ok: true, paymentIntent: pi.id });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
