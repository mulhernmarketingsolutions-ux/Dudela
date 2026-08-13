// Thin wrapper around Printful's REST API — same lightweight fetch pattern as
// lib/stripe.ts / lib/loops.ts / lib/google.ts. No SDK.
//
// Required Cloudflare secret: PRINTFUL_API_KEY (private token, scoped to the
// "DUDELA Store" — Settings → Stores → API → Printful Developers → Tokens).
//
// ARCHITECTURE (rewritten 2026-08-13): every buyable hat is now a real "Sync
// Product" built by hand in Printful's dashboard (Design Maker), with sizing
// verified visually there — not assembled on the fly from raw catalog
// placements/thread options like the old version of this file did. That old
// approach (v2 /orders with catalog_variant_id + placements/layer_options)
// is what caused the oversized-logo bug on John's first real hat (missing
// `position` object defaulting to fill the whole print area) and generally
// fought the API's validator. HAT_CATALOG below is now just a lookup table
// from "which hat did the buyer pick" to a real Printful `sync_variant_id` —
// ordering is a single call to v1's POST /orders using that id (see
// "Specifying products" / Option A in Printful's v1 docs), which is the
// simple, well-trodden integration path.
//
// The 12 published Printful products are really 2 designs × 3 thread colors
// × 2 add-on states (Dude² Dad side embroidery, on or off) = 12 groups, each
// containing 1-4 cap-color variants (thread color and cap color are NOT a
// full cross product — e.g. no cap ships in Black cap + Black thread, since
// the stitching wouldn't show up). That's why /merch's picker has to filter
// cap-color options by the selected thread color rather than offering every
// color for every thread — see HAT_CATALOG below for the real, exact set.

export interface PrintfulEnv {
  PRINTFUL_API_KEY: string;
}

const PRINTFUL_API = "https://api.printful.com";

export type Design = "classic" | "rookie";
export type Thread = "white" | "orange" | "black";

// One buyable hat = one exact (design, thread color, add-on, cap color)
// combination, backed by a real Printful sync_variant_id and two real
// mockup photos (front + a 3/4 angle showing the left side), downloaded
// from Printful's Mockup Generator and saved as permanent static assets in
// public/images/hats/ (the generator's own URLs live on a temporary S3 path
// and aren't safe to hotlink long-term).
//
// `key` is the single identifier used everywhere: the ?product= /
// ?color= value in Stripe Checkout metadata, the merch_orders "color"
// column, and the lookup key here — always
// `${design}-${thread}-${addon ? "withaddon" : "noaddon"}-${printful color slug}`.
export interface HatVariant {
  key: string;
  design: Design;
  designLabel: string;
  thread: Thread;
  threadLabel: string;
  threadHex: string;
  addon: boolean;
  printfulColor: string; // exact Printful catalog color name, e.g. "Black/Natural"
  colorLabel: string; // display name, e.g. "Black / Natural Bill"
  colorHex: string;
  colorHex2?: string; // second swatch color for two-tone (mesh-back) caps
  syncVariantId: number;
  price: string; // "38.00" — every variant is the same price
  frontImage: string;
  leftImage: string;
}

export const HAT_CATALOG: HatVariant[] = [
  {
    key: "classic-white-withaddon-black",
    design: "classic",
    designLabel: "The Classic",
    thread: "white",
    threadLabel: "White",
    threadHex: "#FFFFFF",
    addon: true,
    printfulColor: "Black",
    colorLabel: "Black",
    colorHex: "#141414",
    syncVariantId: 5439468887,
    price: "38.00",
    frontImage: "/images/hats/hat-classic-white-withaddon-black-front.png",
    leftImage: "/images/hats/hat-classic-white-withaddon-black-left.png",
  },
  {
    key: "classic-white-noaddon-black",
    design: "classic",
    designLabel: "The Classic",
    thread: "white",
    threadLabel: "White",
    threadHex: "#FFFFFF",
    addon: false,
    printfulColor: "Black",
    colorLabel: "Black",
    colorHex: "#141414",
    syncVariantId: 5439468400,
    price: "38.00",
    frontImage: "/images/hats/hat-classic-white-noaddon-black-front.png",
    leftImage: "/images/hats/hat-classic-white-noaddon-black-left.png",
  },
  {
    key: "classic-orange-withaddon-black",
    design: "classic",
    designLabel: "The Classic",
    thread: "orange",
    threadLabel: "Rust Orange",
    threadHex: "#E25C27",
    addon: true,
    printfulColor: "Black",
    colorLabel: "Black",
    colorHex: "#141414",
    syncVariantId: 5439466835,
    price: "38.00",
    frontImage: "/images/hats/hat-classic-orange-withaddon-black-front.png",
    leftImage: "/images/hats/hat-classic-orange-withaddon-black-left.png",
  },
  {
    key: "classic-orange-withaddon-black-natural",
    design: "classic",
    designLabel: "The Classic",
    thread: "orange",
    threadLabel: "Rust Orange",
    threadHex: "#E25C27",
    addon: true,
    printfulColor: "Black/Natural",
    colorLabel: "Black / Natural Bill",
    colorHex: "#1c1c1c",
    colorHex2: "#c9b896",
    syncVariantId: 5439466836,
    price: "38.00",
    frontImage: "/images/hats/hat-classic-orange-withaddon-black-natural-front.png",
    leftImage: "/images/hats/hat-classic-orange-withaddon-black-natural-left.png",
  },
  {
    key: "classic-orange-withaddon-dark-green-natural",
    design: "classic",
    designLabel: "The Classic",
    thread: "orange",
    threadLabel: "Rust Orange",
    threadHex: "#E25C27",
    addon: true,
    printfulColor: "Dark Green/Natural",
    colorLabel: "Dark Green / Natural Bill",
    colorHex: "#3a4a32",
    colorHex2: "#c9b896",
    syncVariantId: 5439466837,
    price: "38.00",
    frontImage: "/images/hats/hat-classic-orange-withaddon-dark-green-natural-front.png",
    leftImage: "/images/hats/hat-classic-orange-withaddon-dark-green-natural-left.png",
  },
  {
    key: "classic-orange-withaddon-white",
    design: "classic",
    designLabel: "The Classic",
    thread: "orange",
    threadLabel: "Rust Orange",
    threadHex: "#E25C27",
    addon: true,
    printfulColor: "White",
    colorLabel: "White",
    colorHex: "#f5f5f0",
    syncVariantId: 5439466838,
    price: "38.00",
    frontImage: "/images/hats/hat-classic-orange-withaddon-white-front.png",
    leftImage: "/images/hats/hat-classic-orange-withaddon-white-left.png",
  },
  {
    key: "classic-orange-noaddon-black",
    design: "classic",
    designLabel: "The Classic",
    thread: "orange",
    threadLabel: "Rust Orange",
    threadHex: "#E25C27",
    addon: false,
    printfulColor: "Black",
    colorLabel: "Black",
    colorHex: "#141414",
    syncVariantId: 5439465847,
    price: "38.00",
    frontImage: "/images/hats/hat-classic-orange-noaddon-black-front.png",
    leftImage: "/images/hats/hat-classic-orange-noaddon-black-left.png",
  },
  {
    key: "classic-orange-noaddon-black-natural",
    design: "classic",
    designLabel: "The Classic",
    thread: "orange",
    threadLabel: "Rust Orange",
    threadHex: "#E25C27",
    addon: false,
    printfulColor: "Black/Natural",
    colorLabel: "Black / Natural Bill",
    colorHex: "#1c1c1c",
    colorHex2: "#c9b896",
    syncVariantId: 5439465848,
    price: "38.00",
    frontImage: "/images/hats/hat-classic-orange-noaddon-black-natural-front.png",
    leftImage: "/images/hats/hat-classic-orange-noaddon-black-natural-left.png",
  },
  {
    key: "classic-orange-noaddon-dark-green-natural",
    design: "classic",
    designLabel: "The Classic",
    thread: "orange",
    threadLabel: "Rust Orange",
    threadHex: "#E25C27",
    addon: false,
    printfulColor: "Dark Green/Natural",
    colorLabel: "Dark Green / Natural Bill",
    colorHex: "#3a4a32",
    colorHex2: "#c9b896",
    syncVariantId: 5439465849,
    price: "38.00",
    frontImage: "/images/hats/hat-classic-orange-noaddon-dark-green-natural-front.png",
    leftImage: "/images/hats/hat-classic-orange-noaddon-dark-green-natural-left.png",
  },
  {
    key: "classic-orange-noaddon-white",
    design: "classic",
    designLabel: "The Classic",
    thread: "orange",
    threadLabel: "Rust Orange",
    threadHex: "#E25C27",
    addon: false,
    printfulColor: "White",
    colorLabel: "White",
    colorHex: "#f5f5f0",
    syncVariantId: 5439465850,
    price: "38.00",
    frontImage: "/images/hats/hat-classic-orange-noaddon-white-front.png",
    leftImage: "/images/hats/hat-classic-orange-noaddon-white-left.png",
  },
  {
    key: "classic-black-withaddon-black-natural",
    design: "classic",
    designLabel: "The Classic",
    thread: "black",
    threadLabel: "Black",
    threadHex: "#000000",
    addon: true,
    printfulColor: "Black/Natural",
    colorLabel: "Black / Natural Bill",
    colorHex: "#1c1c1c",
    colorHex2: "#c9b896",
    syncVariantId: 5439464546,
    price: "38.00",
    frontImage: "/images/hats/hat-classic-black-withaddon-black-natural-front.png",
    leftImage: "/images/hats/hat-classic-black-withaddon-black-natural-left.png",
  },
  {
    key: "classic-black-withaddon-dark-green-natural",
    design: "classic",
    designLabel: "The Classic",
    thread: "black",
    threadLabel: "Black",
    threadHex: "#000000",
    addon: true,
    printfulColor: "Dark Green/Natural",
    colorLabel: "Dark Green / Natural Bill",
    colorHex: "#3a4a32",
    colorHex2: "#c9b896",
    syncVariantId: 5439464547,
    price: "38.00",
    frontImage: "/images/hats/hat-classic-black-withaddon-dark-green-natural-front.png",
    leftImage: "/images/hats/hat-classic-black-withaddon-dark-green-natural-left.png",
  },
  {
    key: "classic-black-withaddon-white",
    design: "classic",
    designLabel: "The Classic",
    thread: "black",
    threadLabel: "Black",
    threadHex: "#000000",
    addon: true,
    printfulColor: "White",
    colorLabel: "White",
    colorHex: "#f5f5f0",
    syncVariantId: 5439464548,
    price: "38.00",
    frontImage: "/images/hats/hat-classic-black-withaddon-white-front.png",
    leftImage: "/images/hats/hat-classic-black-withaddon-white-left.png",
  },
  {
    key: "classic-black-noaddon-black-natural",
    design: "classic",
    designLabel: "The Classic",
    thread: "black",
    threadLabel: "Black",
    threadHex: "#000000",
    addon: false,
    printfulColor: "Black/Natural",
    colorLabel: "Black / Natural Bill",
    colorHex: "#1c1c1c",
    colorHex2: "#c9b896",
    syncVariantId: 5439463184,
    price: "38.00",
    frontImage: "/images/hats/hat-classic-black-noaddon-black-natural-front.png",
    leftImage: "/images/hats/hat-classic-black-noaddon-black-natural-left.png",
  },
  {
    key: "classic-black-noaddon-dark-green-natural",
    design: "classic",
    designLabel: "The Classic",
    thread: "black",
    threadLabel: "Black",
    threadHex: "#000000",
    addon: false,
    printfulColor: "Dark Green/Natural",
    colorLabel: "Dark Green / Natural Bill",
    colorHex: "#3a4a32",
    colorHex2: "#c9b896",
    syncVariantId: 5439463185,
    price: "38.00",
    frontImage: "/images/hats/hat-classic-black-noaddon-dark-green-natural-front.png",
    leftImage: "/images/hats/hat-classic-black-noaddon-dark-green-natural-left.png",
  },
  {
    key: "classic-black-noaddon-white",
    design: "classic",
    designLabel: "The Classic",
    thread: "black",
    threadLabel: "Black",
    threadHex: "#000000",
    addon: false,
    printfulColor: "White",
    colorLabel: "White",
    colorHex: "#f5f5f0",
    syncVariantId: 5439463186,
    price: "38.00",
    frontImage: "/images/hats/hat-classic-black-noaddon-white-front.png",
    leftImage: "/images/hats/hat-classic-black-noaddon-white-left.png",
  },
  {
    key: "rookie-white-withaddon-black",
    design: "rookie",
    designLabel: "The Rookie",
    thread: "white",
    threadLabel: "White",
    threadHex: "#FFFFFF",
    addon: true,
    printfulColor: "Black",
    colorLabel: "Black",
    colorHex: "#141414",
    syncVariantId: 5439461713,
    price: "38.00",
    frontImage: "/images/hats/hat-rookie-white-withaddon-black-front.png",
    leftImage: "/images/hats/hat-rookie-white-withaddon-black-left.png",
  },
  {
    key: "rookie-white-noaddon-black",
    design: "rookie",
    designLabel: "The Rookie",
    thread: "white",
    threadLabel: "White",
    threadHex: "#FFFFFF",
    addon: false,
    printfulColor: "Black",
    colorLabel: "Black",
    colorHex: "#141414",
    syncVariantId: 5439460668,
    price: "38.00",
    frontImage: "/images/hats/hat-rookie-white-noaddon-black-front.png",
    leftImage: "/images/hats/hat-rookie-white-noaddon-black-left.png",
  },
  {
    key: "rookie-black-withaddon-black-natural",
    design: "rookie",
    designLabel: "The Rookie",
    thread: "black",
    threadLabel: "Black",
    threadHex: "#000000",
    addon: true,
    printfulColor: "Black/Natural",
    colorLabel: "Black / Natural Bill",
    colorHex: "#1c1c1c",
    colorHex2: "#c9b896",
    syncVariantId: 5439458182,
    price: "38.00",
    frontImage: "/images/hats/hat-rookie-black-withaddon-black-natural-front.png",
    leftImage: "/images/hats/hat-rookie-black-withaddon-black-natural-left.png",
  },
  {
    key: "rookie-black-withaddon-white",
    design: "rookie",
    designLabel: "The Rookie",
    thread: "black",
    threadLabel: "Black",
    threadHex: "#000000",
    addon: true,
    printfulColor: "White",
    colorLabel: "White",
    colorHex: "#f5f5f0",
    syncVariantId: 5439458183,
    price: "38.00",
    frontImage: "/images/hats/hat-rookie-black-withaddon-white-front.png",
    leftImage: "/images/hats/hat-rookie-black-withaddon-white-left.png",
  },
  {
    key: "rookie-black-noaddon-black-natural",
    design: "rookie",
    designLabel: "The Rookie",
    thread: "black",
    threadLabel: "Black",
    threadHex: "#000000",
    addon: false,
    printfulColor: "Black/Natural",
    colorLabel: "Black / Natural Bill",
    colorHex: "#1c1c1c",
    colorHex2: "#c9b896",
    syncVariantId: 5439456044,
    price: "38.00",
    frontImage: "/images/hats/hat-rookie-black-noaddon-black-natural-front.png",
    leftImage: "/images/hats/hat-rookie-black-noaddon-black-natural-left.png",
  },
  {
    key: "rookie-black-noaddon-white",
    design: "rookie",
    designLabel: "The Rookie",
    thread: "black",
    threadLabel: "Black",
    threadHex: "#000000",
    addon: false,
    printfulColor: "White",
    colorLabel: "White",
    colorHex: "#f5f5f0",
    syncVariantId: 5439456045,
    price: "38.00",
    frontImage: "/images/hats/hat-rookie-black-noaddon-white-front.png",
    leftImage: "/images/hats/hat-rookie-black-noaddon-white-left.png",
  },
  {
    key: "rookie-orange-withaddon-black",
    design: "rookie",
    designLabel: "The Rookie",
    thread: "orange",
    threadLabel: "Rust Orange",
    threadHex: "#E25C27",
    addon: true,
    printfulColor: "Black",
    colorLabel: "Black",
    colorHex: "#141414",
    syncVariantId: 5439451934,
    price: "38.00",
    frontImage: "/images/hats/hat-rookie-orange-withaddon-black-front.png",
    leftImage: "/images/hats/hat-rookie-orange-withaddon-black-left.png",
  },
  {
    key: "rookie-orange-withaddon-dark-green-natural",
    design: "rookie",
    designLabel: "The Rookie",
    thread: "orange",
    threadLabel: "Rust Orange",
    threadHex: "#E25C27",
    addon: true,
    printfulColor: "Dark Green/Natural",
    colorLabel: "Dark Green / Natural Bill",
    colorHex: "#3a4a32",
    colorHex2: "#c9b896",
    syncVariantId: 5439451935,
    price: "38.00",
    frontImage: "/images/hats/hat-rookie-orange-withaddon-dark-green-natural-front.png",
    leftImage: "/images/hats/hat-rookie-orange-withaddon-dark-green-natural-left.png",
  },
  {
    key: "rookie-orange-withaddon-white",
    design: "rookie",
    designLabel: "The Rookie",
    thread: "orange",
    threadLabel: "Rust Orange",
    threadHex: "#E25C27",
    addon: true,
    printfulColor: "White",
    colorLabel: "White",
    colorHex: "#f5f5f0",
    syncVariantId: 5439451936,
    price: "38.00",
    frontImage: "/images/hats/hat-rookie-orange-withaddon-white-front.png",
    leftImage: "/images/hats/hat-rookie-orange-withaddon-white-left.png",
  },
  {
    key: "rookie-orange-noaddon-black",
    design: "rookie",
    designLabel: "The Rookie",
    thread: "orange",
    threadLabel: "Rust Orange",
    threadHex: "#E25C27",
    addon: false,
    printfulColor: "Black",
    colorLabel: "Black",
    colorHex: "#141414",
    syncVariantId: 5436738833,
    price: "38.00",
    frontImage: "/images/hats/hat-rookie-orange-noaddon-black-front.png",
    leftImage: "/images/hats/hat-rookie-orange-noaddon-black-left.png",
  },
  {
    key: "rookie-orange-noaddon-dark-green-natural",
    design: "rookie",
    designLabel: "The Rookie",
    thread: "orange",
    threadLabel: "Rust Orange",
    threadHex: "#E25C27",
    addon: false,
    printfulColor: "Dark Green/Natural",
    colorLabel: "Dark Green / Natural Bill",
    colorHex: "#3a4a32",
    colorHex2: "#c9b896",
    syncVariantId: 5436738834,
    price: "38.00",
    frontImage: "/images/hats/hat-rookie-orange-noaddon-dark-green-natural-front.png",
    leftImage: "/images/hats/hat-rookie-orange-noaddon-dark-green-natural-left.png",
  },
  {
    key: "rookie-orange-noaddon-white",
    design: "rookie",
    designLabel: "The Rookie",
    thread: "orange",
    threadLabel: "Rust Orange",
    threadHex: "#E25C27",
    addon: false,
    printfulColor: "White",
    colorLabel: "White",
    colorHex: "#f5f5f0",
    syncVariantId: 5436738835,
    price: "38.00",
    frontImage: "/images/hats/hat-rookie-orange-noaddon-white-front.png",
    leftImage: "/images/hats/hat-rookie-orange-noaddon-white-left.png",
  },
];

export function getHatVariant(key: string): HatVariant | undefined {
  return HAT_CATALOG.find((h) => h.key === key);
}

// Readable label for receipts/internal notification emails — e.g.
// "Dudela Hat — The Classic, Black / Natural Bill (Rust Orange Stitching, Dude² Dad Add-On)"
export function hatLabel(v: HatVariant): string {
  const addonPart = v.addon ? ", Dude² Dad Add-On" : "";
  return `Dudela Hat — ${v.designLabel}, ${v.colorLabel} (${v.threadLabel} Stitching${addonPart})`;
}

export interface PrintfulRecipient {
  name: string;
  address1: string;
  address2?: string;
  city: string;
  state_code?: string;
  country_code: string;
  zip: string;
  email?: string;
}

// Places a real order with Printful for one hat, referencing the pre-built sync
// variant directly — no catalog placements/thread options to get right at
// order time, since all of that is already baked into the Sync Product in
// Printful's dashboard. Called from the Stripe webhook on
// checkout.session.completed for merch products.
//
// v1's POST /orders supports a `confirm` query param that submits the order
// for fulfillment immediately (skipping the draft phase) in the same call —
// no separate confirmation round-trip needed, unlike the old v2 flow this
// replaced. `update_existing=true` makes retries (a redelivered Stripe
// webhook, or us retrying after a prior failed attempt) safe: Printful
// updates the existing order for that external_id instead of rejecting a
// duplicate, so this doesn't need its own duplicate-detection logic.
//
// v1 has no character limit on external_id (unlike v2's 32-char cap), so the
// raw Stripe session id is used directly — easy to cross-reference in
// Printful's dashboard against the Stripe dashboard.
export async function createPrintfulOrder(
  env: PrintfulEnv,
  opts: {
    syncVariantId: number;
    recipient: PrintfulRecipient;
    externalId: string;
    // Set false to create the order and leave it as an unconfirmed draft
    // instead of submitting it for fulfillment — Printful only charges the
    // store's card once an order is confirmed, so a draft costs nothing and
    // can be freely deleted from the dashboard. Used by
    // /api/admin/test-hat-order to spot-check the real mockup/variant
    // mapping for any hat without spending real money. Real webhook orders
    // always omit this (default true).
    confirm?: boolean;
  }
): Promise<{ id: number; status: string }> {
  const confirm = opts.confirm ?? true;

  const body = {
    external_id: opts.externalId,
    recipient: opts.recipient,
    items: [{ sync_variant_id: opts.syncVariantId, quantity: 1 }],
  };

  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 750 * attempt));
    const res = await fetch(`${PRINTFUL_API}/orders?confirm=${confirm}&update_existing=true`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.PRINTFUL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = (await res.json()) as { result: { id: number; status: string } };
      return data.result;
    }
    lastErr = `${res.status} ${await res.text()}`;
    // Only worth retrying on Printful's "still calculating costs" race — any
    // other error (bad address, missing variant, etc.) won't fix itself.
    if (!/cost/i.test(lastErr)) break;
  }
  throw new Error(`Printful order create failed: ${lastErr}`);
}
