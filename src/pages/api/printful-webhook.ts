import type { APIContext } from "astro";
import { sendEmail } from "../../lib/email";
import { getMerchOrdersByPrintfulOrderId, claimWebhookEvent } from "../../lib/db";
import { getHatVariant, hatLabel, getShirtVariant, shirtLabel } from "../../lib/printful";
import { emailShell } from "./stripe-webhook";

export const prerender = false;

// Printful webhook endpoint — currently handles package_shipped only.
//
// Unlike Stripe, Printful's webhook setup doesn't include a signing secret
// (confirmed against their docs — POST /webhooks only takes a url + event
// types, nothing else). So instead of an HMAC check, the URL itself carries
// a shared-secret query param (?token=...), checked below against the
// PRINTFUL_WEBHOOK_TOKEN Cloudflare secret — same "shared password" pattern
// already used for /admin. Worst case if someone guessed the URL without the
// token is a bogus tracking email; there's no money or fulfillment action
// here, so this is a proportionate amount of protection, not paranoia.
//
// One-time setup once PRINTFUL_WEBHOOK_TOKEN is set: call
// /api/admin/printful-webhook-setup while logged in at /admin/login to
// register this URL with Printful for the package_shipped event type.
//
// Field names below (data.shipment.tracking_number/tracking_url/carrier,
// data.order.id) are Printful's documented, standard shipment fields — but
// their public docs render the exact schema behind a collapsed "Expand all"
// UI that couldn't be scraped to 100% certainty. First real fired event
// should be spot-checked in Workers Logs (the raw payload is always logged
// below, first thing, precisely so that's possible) against what actually
// arrives, in case a field name needs adjusting.
export async function POST({ request, locals }: APIContext) {
  const env = (locals as any).runtime.env;
  const url = new URL(request.url);

  if (!env.PRINTFUL_WEBHOOK_TOKEN || url.searchParams.get("token") !== env.PRINTFUL_WEBHOOK_TOKEN) {
    console.error("Printful webhook: missing/invalid token");
    return new Response("Unauthorized", { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(await request.text());
  } catch (err) {
    return new Response("Invalid payload", { status: 400 });
  }

  // Always logged raw, first — the one source of truth if the field-name
  // assumptions below turn out to be wrong on a real payload.
  console.log("Printful webhook received:", JSON.stringify(event));

  if (event?.type !== "package_shipped") {
    // Ack anything else (package_returned, order_failed, etc.) — not
    // handled yet, but a 200 here means Printful won't keep retrying it.
    return new Response(JSON.stringify({ received: true, ignored: event?.type }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const shipment = event.data?.shipment || {};
  const order = event.data?.order || {};
  const printfulOrderId: number | undefined = order.id;
  const trackingNumber: string | undefined = shipment.tracking_number;
  const trackingUrl: string | undefined = shipment.tracking_url;
  const carrier: string | undefined = shipment.carrier || shipment.service;

  if (!printfulOrderId) {
    console.error("Printful webhook: package_shipped with no order id in payload");
    return new Response(JSON.stringify({ received: true, error: "no order id" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Dedup per shipment (not per order) — Printful fires this event once per
  // shipment, and a bundle order can ship as 2+ shipments. Falls back to
  // order id + created timestamp if tracking_number is ever missing, so a
  // malformed payload still can't loop-send.
  const dedupeKey = `printful-shipment:${trackingNumber || `${printfulOrderId}:${event.created || Date.now()}`}`;
  const isFirstDelivery = await claimWebhookEvent(env, dedupeKey);
  if (!isFirstDelivery) {
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const orders = await getMerchOrdersByPrintfulOrderId(env, printfulOrderId);
  if (orders.length === 0) {
    // Not necessarily a bug — could be an order placed before printful_order_id
    // was tracked (migrations/0006), or a manual/test order made directly in
    // the Printful dashboard rather than through the site.
    console.error(`Printful webhook: no merch_orders row for printful_order_id ${printfulOrderId}`);
    return new Response(JSON.stringify({ received: true, error: "no matching order" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const email = orders[0].email;
  const name = orders[0].name;
  const itemLabels = orders.map((o) => {
    const hat = getHatVariant(o.color);
    const shirt = hat ? undefined : getShirtVariant(o.color);
    return hat ? hatLabel(hat) : shirt ? shirtLabel(shirt) : o.color;
  });

  try {
    await sendEmail(env, {
      to: email,
      subject: "Your Dudela order is on its way 📦",
      html: trackingEmailHtml({ name: name || "", items: itemLabels, trackingNumber, trackingUrl, carrier }),
    });
  } catch (err) {
    console.error("Tracking email send failed:", err);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function trackingEmailHtml(opts: {
  name: string;
  items: string[];
  trackingNumber?: string;
  trackingUrl?: string;
  carrier?: string;
}) {
  const firstName = opts.name ? opts.name.split(" ")[0] : "there";
  const itemsList = opts.items.map((i) => `<li style="margin-bottom:4px;">${i}</li>`).join("");
  const trackingBlock = opts.trackingUrl
    ? `
      <div style="text-align:center;margin:26px 0;">
        <a href="${opts.trackingUrl}" style="display:inline-block;background:#e27d25;color:#12180f;padding:15px 30px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">
          Track your package
        </a>
      </div>`
    : opts.trackingNumber
    ? `<p style="color:#1c2319;font-size:15px;margin:0 0 18px;"><strong>Tracking number:</strong> ${opts.trackingNumber}${opts.carrier ? ` (${opts.carrier})` : ""}</p>`
    : "";

  return emailShell(`
    <p style="color:#1c2319;font-size:17px;line-height:1.6;margin:0 0 18px;">Hey ${firstName},</p>
    <p style="color:#1c2319;font-size:17px;line-height:1.6;margin:0 0 18px;">
      Good news — your order is packed up and on its way.
    </p>
    <ul style="color:#1c2319;font-size:15px;line-height:1.6;margin:0 0 18px;padding-left:20px;">
      ${itemsList}
    </ul>
    ${trackingBlock}
    <p style="color:#1c2319;font-size:15px;margin:26px 0 0;">— John &amp; Mike, Dudela</p>
  `);
}
