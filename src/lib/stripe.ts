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
    // Exactly one of priceId (a pre-created Stripe Price object) or
    // priceData (inline price_data) must be given for the main line item.
    // priceData exists so a new product line (shirts) doesn't need a
    // hand-created Stripe Price + env var per variant — same technique
    // already used below for the hat add-on's extraLineItem.
    priceId?: string;
    priceData?: { name: string; unitAmountCents: number };
    successUrl: string;
    cancelUrl: string;
    customerEmail?: string;
    // If the buyer is already a known Stripe customer (e.g. an existing
    // Spit-Up Society member buying a hat while logged in), pass their
    // customer id here instead of customerEmail — Stripe only accepts one or
    // the other. This is what makes a one-time purchase show up in the same
    // Billing Portal as their membership, instead of creating a brand-new
    // disconnected guest customer for every purchase.
    customerId?: string;
    metadata?: Record<string, string>;
    // "payment" for one-time purchases (Prep Kit, hats), "subscription" for recurring
    // membership billing (Spit-Up Society). Defaults to "payment" to match existing callers.
    mode?: "payment" | "subscription";
    // Physical goods (the merch hats) need a shipping address — digital
    // products (Prep Kit, Spit-Up Society) don't set this and get none of
    // the fields below added to the session.
    collectShipping?: boolean;
    // ISO country codes Stripe will accept for shipping_address_collection.
    // Defaults to US-only, which is all the presale supports for now.
    shippingCountries?: string[];
    // One-time ("payment" mode) Checkout Sessions don't generate a Stripe
    // Invoice by default — without this, even a purchase attached to the
    // right customer won't show up in their Billing Portal invoice history.
    // Subscriptions already generate invoices automatically, so this only
    // matters (and is only passed) for one-time purchases.
    invoiceCreation?: boolean;
    // Optional second line item priced inline via Stripe's price_data
    // instead of a pre-created Price object — used for the $1 Dude to Dad
    // add-on surcharge so it doesn't need its own Stripe Price ID per hat
    // variant (28 variants × 2 add-on states would mean maintaining twice as
    // many price env vars for a flat $1 bump). Shows up as its own line item
    // at Stripe Checkout, e.g. "Dudela Hat — $38" + "Dude to Dad Stitch — $1".
    extraLineItem?: { name: string; unitAmountCents: number };
  }
) {
  const mode = opts.mode || "payment";
  const params: Record<string, string> = {
    mode,
    "line_items[0][quantity]": "1",
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
  };
  if (opts.priceId) {
    params["line_items[0][price]"] = opts.priceId;
  } else if (opts.priceData) {
    params["line_items[0][price_data][currency]"] = "usd";
    params["line_items[0][price_data][unit_amount]"] = String(opts.priceData.unitAmountCents);
    params["line_items[0][price_data][product_data][name]"] = opts.priceData.name;
  } else {
    throw new Error("createCheckoutSession requires either priceId or priceData");
  }
  if (opts.extraLineItem) {
    params["line_items[1][price_data][currency]"] = "usd";
    params["line_items[1][price_data][unit_amount]"] = String(opts.extraLineItem.unitAmountCents);
    params["line_items[1][price_data][product_data][name]"] = opts.extraLineItem.name;
    params["line_items[1][quantity]"] = "1";
  }
  // Stripe rejects a session that sets both `customer` and `customer_email` —
  // prefer the known customer id so the purchase attaches to their existing
  // record instead of spinning up a new disconnected guest customer.
  if (opts.customerId) {
    params.customer = opts.customerId;
  } else if (opts.customerEmail) {
    params.customer_email = opts.customerEmail;
  }
  if (opts.invoiceCreation && mode === "payment") {
    params["invoice_creation[enabled]"] = "true";
  }
  if (opts.metadata) {
    for (const [k, v] of Object.entries(opts.metadata)) {
      params[`metadata[${k}]`] = v;
      // For subscription mode, Stripe attaches Checkout Session metadata to the
      // Session itself but NOT to the resulting Subscription object automatically.
      // Mirror it onto subscription_data[metadata] too so the cancellation webhook
      // (customer.subscription.deleted) can still read which product this was.
      if (mode === "subscription") {
        params[`subscription_data[metadata][${k}]`] = v;
      }
    }
  }
  if (opts.collectShipping) {
    const countries = opts.shippingCountries?.length ? opts.shippingCountries : ["US"];
    countries.forEach((c, i) => {
      params[`shipping_address_collection[allowed_countries][${i}]`] = c;
    });
    // Free shipping — matches the "$38, free shipping" copy on /merch. Given as
    // a zero-amount shipping rate rather than folding it into the price so the
    // buyer sees "Shipping: Free" as its own line at Stripe checkout.
    params["shipping_options[0][shipping_rate_data][type]"] = "fixed_amount";
    params["shipping_options[0][shipping_rate_data][fixed_amount][amount]"] = "0";
    params["shipping_options[0][shipping_rate_data][fixed_amount][currency]"] = "usd";
    params["shipping_options[0][shipping_rate_data][display_name]"] = "Free shipping";
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

// Creates a Stripe Billing Portal session so members can update their card,
// see invoices, or cancel — without us building any of that UI ourselves.
// Used by /api/create-portal-session.ts from the gated member dashboard.
export async function createPortalSession(
  env: StripeEnv,
  opts: { customerId: string; returnUrl: string }
): Promise<{ url: string }> {
  const params: Record<string, string> = {
    customer: opts.customerId,
    return_url: opts.returnUrl,
  };
  const res = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: toFormBody(params),
  });
  if (!res.ok) {
    throw new Error(`Stripe portal session create failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<{ url: string }>;
}

// Subscription lifecycle events (customer.subscription.deleted, .updated) only include the
// customer ID, not their email — fetch it from the Customers API so the cancellation
// webhook can still tag the right contact in Loops.
export async function getCustomer(
  env: StripeEnv,
  customerId: string
): Promise<{ email: string | null; name: string | null }> {
  const res = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
  });
  if (!res.ok) {
    throw new Error(`Stripe customer fetch failed: ${res.status} ${await res.text()}`);
  }
  const customer = (await res.json()) as { email: string | null; name: string | null };
  return { email: customer.email, name: customer.name };
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
