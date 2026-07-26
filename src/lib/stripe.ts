// Thin wrapper around Stripe's REST API. No SDK — same pattern as lib/email.ts and
// lib/loops.ts, using raw fetch so it stays lightweight in the Worker runtime.
//
// Required Cloudflare secrets:
//   STRIPE_SECRET_KEY      — sk_test_... (test mode) or sk_live_... (live mode)
//   STRIPE_WEBHOOK_SECRET   — whsec_... from the Stripe webhook endpoint settings
//
// Price IDs (price_...) for each product are also stored as env vars so they can
// change without a code deploy — see STRIPE_PRICES below and PRODUCTS.md-equivalent
// mapping in create-checkout-session.ts.

export interface StripeEnv {
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
}

// Stripe's classic REST API takes application/x-www-form-urlencoded bodies with
// bracket notation for nested objects/arrays (e.g. line_items[0][price]).
function toFormBody(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

export async function createCheckoutSession(
  env: StripeEnv,
  opts: {
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    customerEmail?: string;
    metadata?: Record<string, string>;
  }
) {
  const params: Record<string, string> = {
    mode: "payment",
    "line_items[0][price]": opts.priceId,
    "line_items[0][quantity]": "1",
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
  };
  if (opts.customerEmail) params.customer_email = opts.customerEmail;
  if (opts.metadata) {
    for (const [k, v] of Object.entries(opts.metadata)) {
      params[`metadata[${k}]`] = v;
    }
  }

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: toFormBody(params),
  });

  if (!res.ok) {
    throw new Error(`Stripe checkout session create failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<{ id: string; url: string }>;
}

// Verifies the Stripe-Signature header per Stripe's documented v1 scheme:
// signed_payload = `${timestamp}.${rawBody}`, HMAC-SHA256 with the webhook secret,
// hex digest compared to the v1 signature(s) in the header. Uses Web Crypto (available
// natively in the Workers runtime) instead of the Stripe SDK to avoid pulling in Node
// polyfills just for this one check.
export async function verifyStripeSignature(
  rawBody: string,
  sigHeader: string | null,
  secret: string
): Promise<boolean> {
  if (!sigHeader) return false;

  const parts = Object.fromEntries(
    sigHeader.split(",").map((part) => {
      const [k, v] = part.split("=");
      return [k, v];
    })
  );
  const timestamp = parts["t"];
  const signature = parts["v1"];
  if (!timestamp || !signature) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signedPayload = `${timestamp}.${rawBody}`;
  const sigBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
  const expectedHex = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time-ish comparison (length check + char compare) — good enough here since
  // this isn't a hot path and Workers doesn't expose crypto.timingSafeEqual.
  if (expectedHex.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expectedHex.length; i++) {
    mismatch |= expectedHex.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}
