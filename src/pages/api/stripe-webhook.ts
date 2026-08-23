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
// Shared shape for both the fixed PRODUCTS catalog below and the bundle
// branch's hand-built object in the webhook handler — declared once so
// TypeScript checks both against the exact same type instead of inferring a
// narrower union from each object literal (which used to make fields added
// only on one branch, like isBundle/items, invisible to code that reads
// `productInfo.X` without knowing which branch produced it).
type ProductInfo = {
  name: string;
  price: string;
  isSubscription?: boolean;
  fileName?: string;
  url?: string;
  isMerch?: boolean;
  isBundle?: boolean;
  // Relative /images/... path — resolved to an absolute thedudelaco.com
  // URL in receiptEmailHtml/notifyEmailHtml, same reasoning as
  // create-checkout-session.ts's priceData.image (email clients need a
  // real https URL, they don't run relative to the site).
  image?: string;
  // Bundle orders only: both items broken out separately so the receipt/
  // notify emails can show each product's own photo, not just one.
  items?: { name: string; image?: string }[];
};

export const PRODUCTS: Record<string, ProductInfo> = {
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

// Printful's costs.total (see lib/printful.ts PrintfulOrderCosts) is what
// Printful actually bills the store for an order — dollars-and-cents string,
// same shape as everywhere else costs are handled here. Returns cents so it
// can be diffed directly against Stripe's amount_total (also cents) for a
// profit figure, or undefined if Printful hadn't finished calculating costs
// (rare, but the order-creation retry loop already handles that race).
function printfulCostCents(costs?: { total?: string }): number | undefined {
  const n = costs?.total ? parseFloat(costs.total) : NaN;
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
}

export function receiptEmailHtml(name: string, product: ProductInfo) {
  const firstName = name ? name.split(" ")[0] : "there";

  if (product.isMerch) {
    const items = product.items && product.items.length > 0 ? product.items : [{ name: product.name, image: product.image }];

    const imagesBlock =
      items.length > 1
        ? `
      <table role="presentation" width="100%" style="width:100%;margin:0 0 22px;border-collapse:collapse;table-layout:fixed;">
        <tr>
          ${items
            .map((item) => {
              const imgUrl = absoluteImageUrl(item.image);
              return `<td style="width:50%;text-align:center;padding:0 6px;vertical-align:top;">
                ${
                  imgUrl
                    ? `<img src="${imgUrl}" alt="${item.name}" width="140" style="width:100%;max-width:140px;height:auto;border-radius:10px;display:inline-block;" />`
                    : ""
                }
                <p style="color:#1c2319;font-size:13px;line-height:1.4;margin:8px 0 0;">${item.name}</p>
              </td>`;
            })
            .join("")}
        </tr>
      </table>`
        : absoluteImageUrl(items[0].image)
          ? `
      <div style="text-align:center;margin:0 0 22px;">
        <img src="${absoluteImageUrl(items[0].image)}" alt="${items[0].name}" width="180" style="width:180px;max-width:100%;height:auto;border-radius:10px;display:inline-block;" />
      </div>`
          : "";

    const introCopy =
      items.length > 1
        ? `Thanks for grabbing the <strong>Bundle &amp; Save</strong> (${product.price}) — here's what's headed your way:`
        : `Thanks for grabbing a <strong>${product.name}</strong> (${product.price}) — here's your receipt.`;

    return emailShell(`
      <p style="color:#1c2319;font-size:17px;line-height:1.6;margin:0 0 18px;">Hey ${firstName},</p>
      <p style="color:#1c2319;font-size:17px;line-height:1.6;margin:0 0 18px;">
        ${introCopy}
      </p>
      ${imagesBlock}
      <p style="color:#1c2319;font-size:17px;line-height:1.6;margin:0 0 18px;">
        Made to order, so it'll take a little longer than a normal shipment — we'll email you the second it's on its way.
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
      Thanks for grabbing <strong>${product.name}</strong> (${product.price}) — this receipt confirms your purchase.
    </p>
    ${deliveryBlock}
    <p style="color:#1c2319;font-size:15px;margin:26px 0 0;">— John &amp; Mike, Dudela</p>
  `);
}

// Short, warm subject line per product type. Deliberately does NOT include
// the full product name/variant string — for a bundle that string is "Bundle
// — Dudela Hat — The Rookie, Dark Green / Natural Bill (Rust Orange
// Stitching, Dude to Dad Stitch) + Dudela Shirt — DAD EST. 2024, Black, Size
// L", which reads like a database dump in an inbox and gets truncated by
// most mail clients anyway. The full details still show inside the email
// body, where there's room to do it justice.
function receiptSubject(product: { name: string; isSubscription?: boolean; isBundle?: boolean; isMerch?: boolean }): string {
  if (product.isSubscription) return "Welcome to the Spit-Up Society!";
  if (product.isBundle) return "Your Dudela bundle is confirmed!";
  if (product.isMerch) return "Your Dudela order is confirmed!";
  return `Your ${product.name} is here!`;
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
  // Bundle orders: both items' photos, so John/Mike see the whole order at
  // a glance instead of just the hat.
  items?: { name: string; image?: string }[];
  shippingName?: string | null;
  shippingAddress?: string | null;
}) {
  const items = opts.items && opts.items.length > 0 ? opts.items : opts.image ? [{ name: "", image: opts.image }] : [];
  const thumbBlock =
    items.length > 1
      ? `<div style="margin:0 0 14px;">
          ${items
            .map((item) => {
              const imgUrl = absoluteImageUrl(item.image);
              return imgUrl
                ? `<img src="${imgUrl}" alt="${item.name}" style="width:90px;height:auto;border-radius:8px;display:inline-block;margin-right:8px;" />`
                : "";
            })
            .join("")}
        </div>`
      : (() => {
          const imgUrl = absoluteImageUrl(items[0]?.image);
          return imgUrl
            ? `<img src="${imgUrl}" alt="" style="width:110px;height:auto;border-radius:8px;display:block;margin:0 0 14px;" />`
            : "";
        })();
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

  // Stripe stamps every event with livemode: false when it came from a Test
  // Mode checkout (test API keys + a test card, e.g. 4242 4242 4242 4242) —
  // that's the ONLY reliable way to tell a real purchase from a full
  // pipeline test, since a test-mode session otherwise looks identical to a
  // real one by the time it reaches this webhook. Used below to (a) never
  // let a test purchase place a real, billed Printful order — confirm:false
  // instead, same free-draft behavior as /api/admin/test-hat-order — and
  // (b) label the receipt/notify emails and Sheet row so a test run can
  // never be mistaken for real revenue.
  const isTestMode = event.livemode === false;

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
      const productInfo: ProductInfo = isBundle
        ? {
            name:
              bundleHatVariant && bundleShirtVariant
                ? `Bundle — ${hatLabel(bundleHatVariant)} + ${shirtLabel(bundleShirtVariant)}`
                : "Dudela Bundle",
            price: amountTotal,
            isMerch: true,
            isBundle: true,
            image: bundleHatVariant?.frontImage,
            // Both items broken out separately (not just the combined `name`
            // string above) so the receipt/notify emails can show each
            // product's own photo — a bundle buyer should see both the hat
            // AND the shirt they're getting, not just the hat.
            items:
              bundleHatVariant && bundleShirtVariant
                ? [
                    { name: hatLabel(bundleHatVariant), image: bundleHatVariant.frontImage },
                    { name: shirtLabel(bundleShirtVariant), image: bundleShirtVariant.frontImage },
                  ]
                : undefined,
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
        let bundleCostCents: number | undefined;
        if (bundleHatVariant?.syncVariantId && bundleShirtVariant?.syncVariantId && recipient) {
          try {
            const result = await createPrintfulOrder(env, {
              syncVariantId: bundleHatVariant.syncVariantId,
              extraSyncVariantIds: [bundleShirtVariant.syncVariantId],
              recipient,
              externalId: await shortExternalId(session.id),
              // Test-mode Stripe event → leave as a free unconfirmed draft
              // (same behavior as /api/admin/test-hat-order) instead of a
              // real, billed Printful order. Omitted (defaults to true) for
              // real events, unchanged from before.
              confirm: isTestMode ? false : undefined,
            });
            bundlePrintfulOrderId = result.id;
            bundleCostCents = printfulCostCents(result.costs);
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

        // Two merch_orders rows (one per item) so each shows up separately
        // in "Your Orders" — merch_orders.session_id is UNIQUE (normally one
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
            await appendSheetRow(accessToken, env.GOOGLE_SHEET_ID, "Merch Orders!A:J", [
              new Date().toISOString(),
              name,
              email,
              `bundle: ${hatKey} + ${shirtKey}`,
              shippingName || "",
              shippingAddress || "",
              amountTotal,
              bundleCostCents !== undefined ? `$${(bundleCostCents / 100).toFixed(2)}` : "",
              bundleCostCents !== undefined && typeof session.amount_total === "number"
                ? `$${((session.amount_total - bundleCostCents) / 100).toFixed(2)}`
                : "",
              isTestMode ? "TEST" : "",
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
        let itemCostCents: number | undefined;
        if (syncVariantId && recipient) {
          try {
            const result = await createPrintfulOrder(env, {
              syncVariantId,
              recipient,
              externalId: await shortExternalId(session.id),
              // See the isTestMode comment near the top of this handler —
              // a Stripe test-mode purchase must never place a real, billed
              // Printful order. Omitted (defaults to true) for real events.
              confirm: isTestMode ? false : undefined,
            });
            printfulOrderId = result.id;
            itemCostCents = printfulCostCents(result.costs);
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

        // D1 is the operational record for this order (powers "Your Orders" on
        // /member/dashboard and merch-shipped tracking emails).
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
        // having a scannable list of name/color/address/cost/profit here is still
        // useful for spot-checking orders and watching margin as sales come in.
        // Columns H/I/J (Cost/Profit/Test) added 2026-08-16 — add those headers to
        // the sheet once by hand; append only ever writes values, never headers.
        // Gated by isFirstDelivery so a redelivered event doesn't append a
        // duplicate row every retry.
        if (isFirstDelivery) {
          try {
            const accessToken = await getGoogleAccessToken(env, [GOOGLE_SCOPES.sheets]);
            await appendSheetRow(accessToken, env.GOOGLE_SHEET_ID, "Merch Orders!A:J", [
              new Date().toISOString(),
              name,
              email,
              color,
              shippingName || "",
              shippingAddress || "",
              amountTotal,
              itemCostCents !== undefined ? `$${(itemCostCents / 100).toFixed(2)}` : "",
              itemCostCents !== undefined && typeof session.amount_total === "number"
                ? `$${((session.amount_total - itemCostCents) / 100).toFixed(2)}`
                : "",
              isTestMode ? "TEST" : "",
            ]);
          } catch (err) {
            console.error("Merch order sheet log failed:", err);
          }
        }
      }

      if (isFirstDelivery) {
        // [TEST] prefix on both emails whenever this came from a Stripe
        // test-mode purchase — same convention /api/admin/test-hat-order
        // already uses — so a real receipt/notification is never confused
        // with a pipeline test run.
        const subjectPrefix = isTestMode ? "[TEST] " : "";
        try {
          await sendEmail(env, {
            to: email,
            subject: `${subjectPrefix}${receiptSubject(productInfo)}`,
            html: receiptEmailHtml(name, productInfo),
          });
        } catch (err) {
          console.error("Purchase receipt email failed:", err);
        }

        try {
          await sendEmail(env, {
            to: env.NOTIFY_EMAIL || "dude@thedudelaco.com",
            // Kept short (no full product name/variant string) same reasoning
            // as receiptSubject above — the body already has the full
            // productLabel plus, for bundles, both item photos.
            subject: `${subjectPrefix}New ${productInfo.isSubscription ? "member" : "purchase"} — ${email}`,
            html: notifyEmailHtml({
              email,
              name,
              product,
              productLabel: productInfo.name,
              amount: amountTotal,
              event: productInfo.isSubscription ? "New subscriber" : "New purchase",
              image: productInfo.image,
              items: productInfo.items,
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
