import type { APIContext } from "astro";
import { verifyStripeSignature, getCustomer } from "../../lib/stripe";
import { sendLoopsPurchaseEvent, sendLoopsCancellationEvent } from "../../lib/loops";
import { sendEmail } from "../../lib/email";
import {
  upsertMemberFromStripe,
  markMemberCanceledByStripeCustomerId,
  createMerchOrder,
  claimWebhookEvent,
} from "../../lib/db";
import { getGoogleAccessToken, appendSheetRow, GOOGLE_SCOPES } from "../../lib/google";
import { createPrintfulOrder, getHatConfig } from "../../lib/printful";
import { NEXT_CALL } from "../../lib/next-call";

export const prerender = false;

// Stripe webhook endpoint. Configure in Stripe Dashboard → Developers → Webhooks:
//   URL: https://thedudelaco.com/api/stripe-webhook
//   Events to send: checkout.session.completed, customer.subscription.deleted
// Paste the resulting signing secret into Cloudflare as STRIPE_WEBHOOK_SECRET.
//
// This is the source of truth for "did the purchase/signup actually happen" — never rely
// on the success_url redirect alone, since a buyer can close the tab before that page loads.
//
// PRODUCTS below maps the `product` value we set as Checkout Session metadata (see
// create-checkout-session.ts) to receipt-email copy. isSubscription flips the copy from
// "here's your download" to "welcome to the membership." fileName/url are only relevant
// for one-time digital products — leave unset for subscriptions.
const PRODUCTS: Record<
  string,
  { name: string; price: string; isSubscription?: boolean; fileName?: string; url?: string; isMerch?: boolean }
> = {
  "prep-kit": {
    name: "The Dudela Prep Kit",
    price: "$37",
    fileName: "dudela-prep-kit.pdf",
    url: "https://thedudelaco.com/downloads/dudela-prep-kit.pdf",
  },
  "spit-up-society": {
    name: "The Spit-Up Society",
    price: "$5/mo",
    isSubscription: true,
  },
  "hat-fistbump-cream": {
    name: "Dudela Hat — Cream/Black Bill, Fist Bump",
    price: "$38",
    isMerch: true,
  },
  "hat-fistbump-black": {
    name: "Dudela Hat — Black, Fist Bump",
    price: "$38",
    isMerch: true,
  },
  "hat-fistbump-blackorange": {
    name: "Dudela Hat — Black/Orange Stitch, Fist Bump",
    price: "$38",
    isMerch: true,
  },
  "hat-fistbump-white": {
    name: "Dudela Hat — White, Fist Bump",
    price: "$38",
    isMerch: true,
  },
  "hat-fistbump-whiteblack": {
    name: "Dudela Hat — White/Black Stitch, Fist Bump",
    price: "$38",
    isMerch: true,
  },
  "hat-fistbump-green": {
    name: "Dudela Hat — Cream/Green Bill, Fist Bump",
    price: "$38",
    isMerch: true,
  },
  // Cream/Green Bill is Upside Down's hero color (re-stitched in rust
  // orange) — see printful.ts HAT_CATALOG note.
  "hat-upsidedown-cream": {
    name: "Dudela Hat — Cream/Green Bill, Upside Down",
    price: "$38",
    isMerch: true,
  },
  "hat-upsidedown-black": {
    name: "Dudela Hat — Black, Upside Down",
    price: "$38",
    isMerch: true,
  },
  "hat-upsidedown-blackorange": {
    name: "Dudela Hat — Black/Orange Stitch, Upside Down",
    price: "$38",
    isMerch: true,
  },
  "hat-upsidedown-white": {
    name: "Dudela Hat — White, Upside Down",
    price: "$38",
    isMerch: true,
  },
  "hat-upsidedown-whiteorange": {
    name: "Dudela Hat — White/Orange Stitch, Upside Down",
    price: "$38",
    isMerch: true,
  },
  "hat-upsidedown-blackbill": {
    name: "Dudela Hat — Cream/Black Bill, Upside Down",
    price: "$38",
    isMerch: true,
  },
};

// Stripe's Basil API version (2025-03-31+) moved collected checkout-time
// shipping details from `shipping_details` to `collected_information.shipping_details`.
// Check both so this keeps working whichever the account is actually running.
function extractShippingDetails(session: any): { name: string | null; address: string | null } {
  const shipping = session.collected_information?.shipping_details || session.shipping_details;
  if (!shipping) return { name: null, address: null };
  const a = shipping.address || {};
  const addressLine = [a.line1, a.line2, a.city, a.state, a.postal_code, a.country]
    .filter(Boolean)
    .join(", ");
  return { name: shipping.name || null, address: addressLine || null };
}

// Same source data as extractShippingDetails, but returns the individual address
// fields Printful's Orders API needs (recipient.address1/city/state_code/etc) instead
// of one joined display string.
function extractPrintfulRecipient(session: any, name: string, email: string) {
  const shipping = session.collected_information?.shipping_details || session.shipping_details;
  const a = shipping?.address || {};
  if (!shipping || !a.line1 || !a.city || !a.country) return null;
  return {
    name: shipping.name || name || "Dudela Customer",
    address1: a.line1,
    address2: a.line2 || undefined,
    city: a.city,
    state_code: a.state || undefined,
    country_code: a.country,
    zip: a.postal_code || "",
    email: email || undefined,
  };
}

function emailShell(innerHtml: string) {
  return `
    <div style="background:#12180f;padding:40px 16px;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:460px;margin:0 auto;background:#f5efe3;border-radius:14px;overflow:hidden;">
        <div style="background:#1c2319;padding:26px 32px;text-align:center;">
          <img src="https://thedudelaco.com/logo/dudela-logo-white-full.png" alt="Dudela" style="height:36px;width:auto;display:inline-block;" />
        </div>
        <div style="padding:36px 32px;">
          ${innerHtml}
        </div>
        <div style="padding:0 32px 28px;">
          <p style="color:#8a9280;font-size:12px;line-height:1.5;margin:0;border-top:1px solid #e2d9c4;padding-top:16px;">
            The Dudela Co. &middot; Turning Dudes Into Dads &middot;
            <a href="https://thedudelaco.com" style="color:#8a9280;">thedudelaco.com</a>
          </p>
        </div>
      </div>
    </div>
  `;
}

function receiptEmailHtml(
  name: string,
  product: { name: string; price: string; isSubscription?: boolean; fileName?: string; url?: string; isMerch?: boolean }
) {
  const firstName = name ? name.split(" ")[0] : "there";

  if (product.isMerch) {
    return emailShell(`
      <p style="color:#1c2319;font-size:17px;line-height:1.6;margin:0 0 18px;">Hey ${firstName},</p>
      <p style="color:#1c2319;font-size:17px;line-height:1.6;margin:0 0 18px;">
        You're in — thanks for grabbing a <strong>${product.name}</strong> (${product.price}). Here's your receipt.
      </p>
      <p style="color:#1c2319;font-size:17px;line-height:1.6;margin:0 0 18px;">
        Yours is made to order, so it'll take a little longer than a normal shipment — we'll email you the second it's on its way.
      </p>
      <p style="color:#1c2319;font-size:15px;margin:26px 0 0;">— John &amp; Mike, Dudela</p>
    `);
  }

  if (product.isSubscription) {
    return emailShell(`
      <p style="color:#1c2319;font-size:17px;line-height:1.6;margin:0 0 18px;">Hey ${firstName},</p>
      <p style="color:#1c2319;font-size:17px;line-height:1.6;margin:0 0 18px;">
        You're in — welcome to <strong>${product.name}</strong> (${product.price}). This confirms your membership is active.
      </p>
      <p style="color:#1c2319;font-size:17px;line-height:1.6;margin:0 0 18px;">
        Our next live Q&amp;A is <strong>${NEXT_CALL.dateLabel}</strong> — we'll email you the link
        beforehand, and you can always find the join info on your <a href="https://thedudelaco.com/member/dashboard" style="color:#c66815;">dashboard</a>.
      </p>
      <p style="color:#1c2319;font-size:15px;margin:26px 0 0;">— John &amp; Mike, Dudela</p>
    `);
  }

  const deliveryBlock = product.url
    ? `
      <div style="text-align:center;margin:30px 0 26px;">
        <a href="${product.url}" style="display:inline-block;background:#e27d25;color:#12180f;padding:15px 30px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">
          Download ${product.name}
        </a>
      </div>`
    : `
      <p style="color:#1c2319;font-size:17px;line-height:1.6;margin:0 0 18px;">
        We're finishing up your download link and will email it to you shortly.
      </p>`;

  return emailShell(`
    <p style="color:#1c2319;font-size:17px;line-height:1.6;margin:0 0 18px;">Hey ${firstName},</p>
    <p style="color:#1c2319;font-size:17px;line-height:1.6;margin:0 0 18px;">
      You're in — thanks for grabbing <strong>${product.name}</strong> (${product.price}). This receipt confirms your purchase.
    </p>
    ${deliveryBlock}
    <p style="color:#1c2319;font-size:15px;margin:26px 0 0;">— John &amp; Mike, Dudela</p>
  `);
}

function notifyEmailHtml(opts: { email: string; name: string; product: string; amount: string; event: string }) {
  return `
    <div style="font-family: sans-serif; color: #1c2319; max-width: 480px;">
      <p><strong>${opts.event}:</strong> ${opts.product}${opts.amount ? ` (${opts.amount})` : ""}</p>
      <p>Name: ${opts.name || "(not given)"}<br/>
      Email: ${opts.email}</p>
    </div>
  `;
}

export async function POST({ request, locals }: APIContext) {
  const env = (locals as any).runtime.env;

  const rawBody = await request.text();
  const sigHeader = request.headers.get("stripe-signature");
  const valid = await verifyStripeSignature(rawBody, sigHeader, env.STRIPE_WEBHOOK_SECRET);
  if (!valid) {
    console.error("Stripe webhook signature verification failed");
    return new Response("Invalid signature", { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    return new Response("Invalid payload", { status: 400 });
  }

  // Stripe redelivers the SAME event id on automatic retries, and clicking
  // "Resend" in the Stripe dashboard also redelivers the identical event id
  // (not a new charge, not a new event) — but every one-shot side effect
  // below (customer receipt email, internal admin notification email, Loops
  // event, sheet row) used to fire unconditionally on every delivery. First
  // delivery of any event claims it here; every redelivery after that skips
  // those specifically. Printful order creation and the merch_orders insert
  // are deliberately NOT gated by this — they're separately idempotent
  // (external_id dedup / INSERT OR IGNORE) and need to keep retrying on
  // redelivery so a previously-failed Printful confirmation can still be
  // recovered by resending the event.
  const isFirstDelivery = await claimWebhookEvent(env, event.id);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const email: string = session.customer_details?.email || session.customer_email || "";
    const name: string = session.customer_details?.name || "";
    const product: string = session.metadata?.product || "prep-kit";
    const amountTotal = typeof session.amount_total === "number" ? `$${(session.amount_total / 100).toFixed(2)}` : "";

    if (email) {
      if (isFirstDelivery) {
        try {
          await sendLoopsPurchaseEvent(env, { email, name, product });
        } catch (err) {
          console.error("Loops purchase event failed:", err);
        }
      }

      const productInfo = PRODUCTS[product] || { name: product, price: amountTotal };

      // Membership products (Spit-Up Society, and any future recurring product) get a
      // row in D1 so they can log into the gated member area via magic link. One-time
      // purchases (Prep Kit) don't need an account — they're delivered by email.
      if (productInfo.isSubscription) {
        try {
          await upsertMemberFromStripe(env, {
            email,
            name,
            product,
            stripeCustomerId: session.customer || undefined,
            stripeSubscriptionId: session.subscription || undefined,
          });
        } catch (err) {
          console.error("Member upsert failed:", err);
        }
      }

      if (productInfo.isMerch) {
        const { name: shippingName, address: shippingAddress } = extractShippingDetails(session);
        const color = session.metadata?.color || "unknown";

        // D1 is the operational record — it's what the live "X of 10 left" count on
        // /merch and the presale cap check in create-checkout-session.ts actually read.
        try {
          await createMerchOrder(env, {
            sessionId: session.id,
            color,
            email,
            name,
            shippingName: shippingName || undefined,
            shippingAddress: shippingAddress || undefined,
            amountTotal: typeof session.amount_total === "number" ? session.amount_total : undefined,
          });
        } catch (err) {
          console.error("Merch order insert failed:", err);
        }

        // Places the real order with Printful — this is what makes fulfillment fully
        // automatic (no hand-packing/shipping on John's end). Requires a real shipping
        // address; if Stripe didn't collect one for some reason, this logs an error and
        // falls through rather than throwing, so the buyer's receipt/records still go out.
        const hatConfig = getHatConfig(color);
        const recipient = extractPrintfulRecipient(session, name, email);
        if (hatConfig && recipient) {
          try {
            await createPrintfulOrder(env, {
              hatSlug: color,
              recipient,
              externalId: session.id,
            });
          } catch (err) {
            // Logged as separate fields (not just the Error object) because the
            // default console.error(prefix, err) formatting was showing up with an
            // empty message in Workers Logs — this guarantees the real reason is
            // visible next time this fires.
            const name = err instanceof Error ? err.name : typeof err;
            const message = err instanceof Error ? err.message : String(err);
            const stack = err instanceof Error ? err.stack : undefined;
            console.error(`Printful order creation failed [${name}]: ${message || "(empty message)"}`, { stack });
          }
        } else {
          console.error(`Skipped Printful order for session ${session.id}: hatConfig=${!!hatConfig} recipient=${!!recipient}`);
        }

        // Also logged to the shared Sheet's "Merch Orders" tab as a human-readable
        // backup record — Printful is now the source of truth for fulfillment, but
        // having a scannable list of name/color/address here is still useful for
        // spot-checking that orders actually went through. Gated by isFirstDelivery
        // so a redelivered event doesn't append a duplicate row every retry.
        if (isFirstDelivery) {
          try {
            const accessToken = await getGoogleAccessToken(env, [GOOGLE_SCOPES.sheets]);
            await appendSheetRow(accessToken, env.GOOGLE_SHEET_ID, "Merch Orders!A:G", [
              new Date().toISOString(),
              name,
              email,
              color,
              shippingName || "",
              shippingAddress || "",
              amountTotal,
            ]);
          } catch (err) {
            console.error("Merch order sheet log failed:", err);
          }
        }
      }

      if (isFirstDelivery) {
        try {
          await sendEmail(env, {
            to: email,
            subject: `You're in — ${productInfo.name} receipt`,
            html: receiptEmailHtml(name, productInfo),
          });
        } catch (err) {
          console.error("Purchase receipt email failed:", err);
        }

        try {
          await sendEmail(env, {
            to: env.NOTIFY_EMAIL || "dude@thedudelaco.com",
            subject: `New ${productInfo.isSubscription ? "member" : "purchase"} — ${product} — ${email}`,
            html: notifyEmailHtml({
              email,
              name,
              product,
              amount: amountTotal,
              event: productInfo.isSubscription ? "New subscriber" : "New purchase",
            }),
            replyTo: email,
          });
        } catch (err) {
          console.error("Purchase internal notification failed:", err);
        }
      }
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object;
    const product: string = subscription.metadata?.product || "spit-up-society";
    const customerId: string = subscription.customer;

    try {
      await markMemberCanceledByStripeCustomerId(env, customerId);
    } catch (err) {
      console.error("Member cancel-status update failed:", err);
    }

    try {
      const { email, name } = await getCustomer(env, customerId);
      if (email && isFirstDelivery) {
        try {
          await sendLoopsCancellationEvent(env, { email, name: name || "", product });
        } catch (err) {
          console.error("Loops cancellation event failed:", err);
        }

        try {
          await sendEmail(env, {
            to: env.NOTIFY_EMAIL || "dude@thedudelaco.com",
            subject: `Subscription cancelled — ${product} — ${email}`,
            html: notifyEmailHtml({ email, name: name || "", product, amount: "", event: "Cancellation" }),
            replyTo: email,
          });
        } catch (err) {
          console.error("Cancellation internal notification failed:", err);
        }
      }
    } catch (err) {
      console.error("Stripe customer lookup failed for cancellation:", err);
    }
  }

  // Stripe retries on non-2xx, so always ack once we've made it this far even if a
  // downstream call above failed — the console.error calls are what surface issues.
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
