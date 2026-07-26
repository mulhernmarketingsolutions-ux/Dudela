import type { APIContext } from "astro";
import { verifyStripeSignature } from "../../lib/stripe";
import { sendLoopsPurchaseEvent } from "../../lib/loops";
import { sendEmail } from "../../lib/email";

export const prerender = false;

// Stripe webhook endpoint. Configure in Stripe Dashboard → Developers → Webhooks:
//   URL: https://thedudelaco.com/api/stripe-webhook
//   Events to send: checkout.session.completed
// Paste the resulting signing secret into Cloudflare as STRIPE_WEBHOOK_SECRET.
//
// This is the source of truth for "did the purchase actually happen" — never rely on the
// success_url redirect alone, since a buyer can close the tab before that page loads.
//
// PRODUCTS below maps the `product` value we set as Checkout Session metadata (see
// create-checkout-session.ts) to the delivery file. Once the real Prep Kit PDF is hosted
// under /public/downloads/, add its url here and buyers get it immediately in the receipt
// email — until then they get a "confirmed, sending shortly" note and John gets an internal
// heads-up so it can be sent manually.
const PRODUCTS: Record<string, { name: string; price: string; fileName?: string; url?: string }> = {
  "prep-kit": {
    name: "The Dudela Prep Kit",
    price: "$37",
    fileName: "dudela-prep-kit.pdf",
    url: "https://thedudelaco.com/downloads/dudela-prep-kit.pdf",
  },
};

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

function receiptEmailHtml(name: string, product: { name: string; price: string; fileName?: string; url?: string }) {
  const firstName = name ? name.split(" ")[0] : "there";
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

function notifyEmailHtml(opts: { email: string; name: string; product: string; amount: string }) {
  return `
    <div style="font-family: sans-serif; color: #1c2319; max-width: 480px;">
      <p><strong>New purchase:</strong> ${opts.product} (${opts.amount})</p>
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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const email: string = session.customer_details?.email || session.customer_email || "";
    const name: string = session.customer_details?.name || "";
    const product: string = session.metadata?.product || "prep-kit";
    const amountTotal = typeof session.amount_total === "number" ? `$${(session.amount_total / 100).toFixed(2)}` : "";

    if (email) {
      try {
        await sendLoopsPurchaseEvent(env, { email, name, product });
      } catch (err) {
        console.error("Loops purchase event failed:", err);
      }

      const productInfo = PRODUCTS[product] || { name: product, price: amountTotal };
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
          subject: `New purchase — ${product} — ${email}`,
          html: notifyEmailHtml({ email, name, product, amount: amountTotal }),
          replyTo: email,
        });
      } catch (err) {
        console.error("Purchase internal notification failed:", err);
      }
    }
  }

  // Stripe retries on non-2xx, so always ack once we've made it this far even if a
  // downstream call above failed — the console.error calls are what surface issues.
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
