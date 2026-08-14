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
import {
  createPrintfulOrder,
  getHatVariant,
  HAT_CATALOG,
  hatLabel,
  getShirtVariant,
  SHIRT_CATALOG,
  shirtLabel,
  shortExternalId,
} from "../../lib/printful";
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
// Exported (not just used internally) so /api/admin/test-hat-order.ts can
// send the exact real receipt copy for a spot-check — reusing this instead
// of a second hand-typed copy of the same email means the test tool can
// never drift out of sync with what a real customer actually gets.
export const PRODUCTS: Record<
  string,
  {
    name: string;
    price: string;
    isSubscription?: boolean;
    fileName?: string;
    url?: string;
    isMerch?: boolean;
    // Relative /images/... path — resolved to an absolute thedudelaco.com
    // URL in receiptEmailHtml/notifyEmailHtml, same reasoning as
    // create-checkout-session.ts's priceData.image (email clients need a
    // real https URL, they don't run relative to the site).
    image?: string;
  }
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
  // Every buyable hat — see lib/printful.ts HAT_CATALOG, the single source
  // of truth for the real (design, thread color, add-on, cap color) combos
  // Printful actually has built as sync products. Generated instead of
  // hand-typed so this can never drift out of sync with what's actually
  // buyable on /merch.
  ...Object.fromEntries(
    HAT_CATALOG.map((hat) => [
      hat.key,
      // $39 for Dude to Dad Stitch variants — the $1 add-on surcharge is a
      // separate Stripe line item (see create-checkout-session.ts), but the
      // receipt copy should still show what was actually charged.
      { name: hatLabel(hat), price: hat.addon ? "$39" : "$38", isMerch: true, image: hat.frontImage },
    ])
  ),
  // Every buyable shirt — see lib/printful.ts SHIRT_CATALOG.
  ...Object.fromEntries(
    SHIRT_CATALOG.map((shirt) => [
      shirt.key,
      { name: shirtLabel(shirt), price: `$${Math.round(parseFloat(shirt.price))}`, isMerch: true, image: shirt.frontImage },
    ])
  ),
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

// Exported so /api/printful-webhook.ts's tracking email can reuse the exact
// same branded shell instead of a second hand-typed copy of the header/
// footer markup drifting out of sync with it.
export function emailShell(innerHtml: string) {
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

// Relative /images/... catalog path -> absolute https URL, since email
// clients (unlike the site itself) can't resolve a relative path.
function absoluteImageUrl(image?: string): string | null {
  if (!image) return null;
  return image.startsWith("http") ? image : `https://thedudelaco.com${image}`;
}

export function receiptEmailHtml(
  name: string,
  product: { name: string; price: string; isSubscription?: boolean; fileName?: string; url?: string; isMerch?: boolean; image?: string }
) {
  const firstName = name ? name.split(" ")[0] : "there";

  if (product.isMerch) {
    const imgUrl = absoluteImageUrl(product.image);
    const thumbBlock = imgUrl
      ? `
      <div style="text-align:center;margin:0 0 22px;">
        <img src="${imgUrl}" alt="${product.name}" style="width:180px;height:auto;border-radius:10px;display:inline-block;" />
      </div>`
      : "";
    return emailShell(`
      <p style="color:#1c2319;font-size:17px;line-height:1.6;margin:0 0 18px;">Hey ${firstName},</p>
      ${thumbBlock}
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

// Internal "someone just bought something" email to John/Mike (NOTIFY_EMAIL)
// — sent with replyTo set to the buyer's own email, so hitting Reply sends a
// personal thank-you straight to them with zero extra steps. productLabel/
// image/shipping are only relevant for merch orders (undefined for the Prep
// Kit / Spit-Up Society, which fall back to the plain product key).
function notifyEmailHtml(opts: {
  email: string;
  name: string;
  product: string;
  productLabel?: string;
  amount: string;
  event: string;
  image?: string;
  shippingName?: string | null;
  shippingAddress?: string | null;
}) {
  const imgUrl = absoluteImageUrl(opts.image);
  const thumbBlock = imgUrl
    ? `<img src="${imgUrl}" alt="" style="width:110px;height:auto;border-radius:8px;display:block;margin:0 0 14px;" />`
    : "";
  const shippingBlock =
    opts.shippingName || opts.shippingAddress
      ? `<p style="margin:10px 0 0;">Shipping to: ${opts.shippingName || ""}${
          opts.shippingAddress ? `<br/>${opts.shippingAddress}` : ""
        }</p>`
      : "";
  return `
    <div style="font-family: sans-serif; color: #1c2319; max-width: 480px;">
      ${thumbBlock}
      <p style="margin:0;"><strong>${opts.event}:</strong> ${opts.productLabel || opts.product}${opts.amount ? ` (${opts.amount})` : ""}</p>
      <p style="margin:10px 0 0;">Name: ${opts.name || "(not given)"}<br/>
      Email: ${opts.email}</p>
      ${shippingBlock}
      <p style="margin:16px 0 0;color:#5c6350;font-size:13px;">Hit reply to send them a thank-you — this goes straight to their inbox.</p>
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

      // The hat+shirt bundle isn't a PRODUCTS entry (see create-checkout-session.ts's
      // handleBundleCheckout) since it's parameterized by two catalog picks, not one
      // fixed product — metadata carries hatColor/shirtColor instead of a single color.
      // Built into a PRODUCTS-shaped object here so the exact same receiptEmailHtml/
      // notifyEmailHtml code paths below work unchanged for bundle orders too.
      const isBundle = product === "bundle";
      const bundleHatVariant = isBundle ? getHatVariant(session.metadata?.hatColor || "") : undefined;
      const bundleShirtVariant = isBundle ? getShirtVariant(session.metadata?.shirtColor || "") : undefined;
      const productInfo = isBundle
        ? {
            name:
              bundleHatVariant && bundleShirtVariant
                ? `Bundle — ${hatLabel(bundleHatVariant)} + ${shirtLabel(bundleShirtVariant)}`
                : "Dudela Bundle",
            price: amountTotal,
            isMerch: true,
            image: bundleHatVariant?.frontImage,
          }
        : PRODUCTS[product] || { name: product, price: amountTotal };
      // Hoisted out of the isMerch/isBundle blocks below so the internal notify
      // email (sent further down, after those branches) can include shipping
      // details for merch orders without re-parsing the session.
      let shippingName: string | null = null;
      let shippingAddress: string | null = null;

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

      if (isBundle) {
        ({ name: shippingName, address: shippingAddress } = extractShippingDetails(session));
        const hatKey = session.metadata?.hatColor || "unknown";
        const shirtKey = session.metadata?.shirtColor || "unknown";
        // Split the charged total evenly across the two D1 rows just for a
        // sane per-row amount_total (shown on /member/dashboard) — Stripe's
        // own line items (and the receipt) already show each item's real
        // discounted price; this is only an approximation for that one
        // display field, not used for any accounting.
        const halfAmount =
          typeof session.amount_total === "number" ? Math.round(session.amount_total / 2) : undefined;

        // Printful order created BEFORE the merch_orders insert (unlike the
        // single-item branch below, until it's also flipped) so the real
        // Printful order id is available to store on both rows — that id is
        // what lets /api/printful-webhook.ts's package_shipped handler find
        // this order later and send a real tracking email. One combined
        // Printful order with BOTH items (extraSyncVariantIds) so a bundle
        // buyer gets ONE order to track instead of two — whether that
        // resolves to one physical package or splits into a "partial"
        // multi-shipment (Printful's own status for when items in one order
        // are produced on different lines/timelines, e.g. embroidery vs. DTG
        // print) isn't something we control or promise; see the
        // createPrintfulOrder comment in lib/printful.ts.
        const recipient = extractPrintfulRecipient(session, name, email);
        let bundlePrintfulOrderId: number | undefined;
        if (bundleHatVariant?.syncVariantId && bundleShirtVariant?.syncVariantId && recipient) {
          try {
            const result = await createPrintfulOrder(env, {
              syncVariantId: bundleHatVariant.syncVariantId,
              extraSyncVariantIds: [bundleShirtVariant.syncVariantId],
              recipient,
              externalId: await shortExternalId(session.id),
            });
            bundlePrintfulOrderId = result.id;
          } catch (err) {
            const errName = err instanceof Error ? err.name : typeof err;
            const message = err instanceof Error ? err.message : String(err);
            const stack = err instanceof Error ? err.stack : undefined;
            console.error(`Bundle Printful order creation failed [${errName}]: ${message || "(empty message)"}`, { stack });
          }
        } else {
          console.error(
            `Skipped bundle Printful order for session ${session.id}: hat=${!!bundleHatVariant} shirt=${!!bundleShirtVariant} recipient=${!!recipient}`
          );
        }

        // Two merch_orders rows (one per item) so each still counts toward
        // its own color's scarcity cap and both show up separately in
        // "Your Orders" — merch_orders.session_id is UNIQUE (normally one
        // row per Stripe session), so each row gets a deterministic suffix
        // instead of the bare session id. Deterministic means a redelivered
        // webhook event still resolves to the same two ids, so INSERT OR
        // IGNORE still dedupes a retry instead of creating duplicates. Both
        // rows share the same printful_order_id since it's one combined order.
        try {
          await createMerchOrder(env, {
            sessionId: `${session.id}::hat`,
            color: hatKey,
            email,
            name,
            shippingName: shippingName || undefined,
            shippingAddress: shippingAddress || undefined,
            amountTotal: halfAmount,
            printfulOrderId: bundlePrintfulOrderId,
          });
          await createMerchOrder(env, {
            sessionId: `${session.id}::shirt`,
            color: shirtKey,
            email,
            name,
            shippingName: shippingName || undefined,
            shippingAddress: shippingAddress || undefined,
            amountTotal: halfAmount,
            printfulOrderId: bundlePrintfulOrderId,
          });
        } catch (err) {
          console.error("Bundle merch order insert failed:", err);
        }

        if (isFirstDelivery) {
          try {
            const accessToken = await getGoogleAccessToken(env, [GOOGLE_SCOPES.sheets]);
            await appendSheetRow(accessToken, env.GOOGLE_SHEET_ID, "Merch Orders!A:G", [
              new Date().toISOString(),
              name,
              email,
              `bundle: ${hatKey} + ${shirtKey}`,
              shippingName || "",
              shippingAddress || "",
              amountTotal,
            ]);
          } catch (err) {
            console.error("Bundle order sheet log failed:", err);
          }
        }
      } else if (productInfo.isMerch) {
        ({ name: shippingName, address: shippingAddress } = extractShippingDetails(session));
        const color = session.metadata?.color || "unknown";

        // Printful order created BEFORE the merch_orders insert below so the
        // real Printful order id can be stored on that row — that id is what
        // lets /api/printful-webhook.ts's package_shipped handler find this
        // order later and send a real tracking email, instead of the receipt
        // copy's "we'll email you when it ships" promise going unfulfilled.
        // References the pre-built sync product directly via sync_variant_id — no
        // catalog placements/thread options to get right at order time, since all
        // of that is already baked into the Sync Product in Printful's dashboard.
        // `color` is really "which HAT_CATALOG or SHIRT_CATALOG key" (metadata field
        // name is a holdover from when hats were the only merch product) — check
        // both catalogs since one Stripe `product` key never matches both.
        const hatVariant = getHatVariant(color);
        const shirtVariant = hatVariant ? undefined : getShirtVariant(color);
        const syncVariantId = hatVariant?.syncVariantId ?? shirtVariant?.syncVariantId;
        const recipient = extractPrintfulRecipient(session, name, email);
        let printfulOrderId: number | undefined;
        if (syncVariantId && recipient) {
          try {
            const result = await createPrintfulOrder(env, {
              syncVariantId,
              recipient,
              externalId: await shortExternalId(session.id),
            });
            printfulOrderId = result.id;
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
          console.error(`Skipped Printful order for session ${session.id}: syncVariantId=${!!syncVariantId} recipient=${!!recipient}`);
        }

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
            printfulOrderId,
          });
        } catch (err) {
          console.error("Merch order insert failed:", err);
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
            subject: `New ${productInfo.isSubscription ? "member" : "purchase"} — ${productInfo.name} — ${email}`,
            html: notifyEmailHtml({
              email,
              name,
              product,
              productLabel: productInfo.name,
              amount: amountTotal,
              event: productInfo.isSubscription ? "New subscriber" : "New purchase",
              image: productInfo.image,
              shippingName,
              shippingAddress,
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
