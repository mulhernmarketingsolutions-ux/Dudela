// Thin wrapper around Printful's REST API — same lightweight fetch pattern as
// lib/stripe.ts / lib/loops.ts / lib/google.ts. No SDK.
//
// Required Cloudflare secret: PRINTFUL_API_KEY (private token, scoped to the
// "DUDELA Store" — Settings → Stores → API → Printful Developers → Tokens).
//
// Why this exists: instead of building every color/thread combination as a separate
// product inside Printful's dashboard (which is what the "sync product" flow wants
// you to do, and is exactly what John didn't want — "I don't want to spend all day
// clicking around"), this calls Printful's Catalog API to look up the real Otto Cap
// 31-069 variant_id for whatever color a buyer picked, then places the order directly
// via the Orders API with the right design file + thread color for that variant.
// No dashboard product duplication needed — HAT_CATALOG below is the only place new
// colors/designs get added.
//
// Catalog reads (product id / variant lookup) use v1 endpoints — those are public,
// unauthenticated-for-reads, and still perfectly fine. Order creation uses v2
// (/v2/orders + /v2/orders/{id}/confirmation), not v1 (/orders). This split is
// deliberate, not an oversight: see the note above createPrintfulOrder for why v1
// order creation was abandoned entirely after burning 4 rounds of live 400s against it.

export interface PrintfulEnv {
  PRINTFUL_API_KEY: string;
}

const PRINTFUL_API = "https://api.printful.com";

interface CatalogVariant {
  id: number;
  name: string;
  color: string;
  size: string;
}

let cachedProductId: number | null = null;
let cachedVariants: CatalogVariant[] | null = null;

// Looks up the Otto Cap 31-069's catalog product id by name rather than hardcoding a
// numeric id (Printful's UI doesn't surface the raw id anywhere easy to copy, and
// guessing wrong would silently break every order) — searches the full catalog product
// list once per Worker isolate and caches the match.
async function getCapProductId(env: PrintfulEnv): Promise<number> {
  if (cachedProductId) return cachedProductId;

  const res = await fetch(`${PRINTFUL_API}/products`, {
    headers: { Authorization: `Bearer ${env.PRINTFUL_API_KEY}` },
  });
  if (!res.ok) {
    throw new Error(`Printful product list lookup failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { result: Array<{ id: number; title: string; model?: string }> };
  const match = data.result.find(
    (p) => p.title.includes("31-069") || (p.model && p.model.includes("31-069"))
  );
  if (!match) {
    throw new Error('Could not find "Otto Cap 31-069" in Printful catalog product list');
  }
  cachedProductId = match.id;
  return cachedProductId;
}

// Looks up every catalog variant (color/size combo) Printful sells for the Otto Cap
// 31-069, caching in-memory for the life of the Worker isolate so repeat orders in the
// same isolate don't re-fetch. Cold starts still do two fetches (product id, then its
// variants) — acceptable for how infrequently hats sell right now.
async function getCapVariants(env: PrintfulEnv): Promise<CatalogVariant[]> {
  if (cachedVariants) return cachedVariants;

  const productId = await getCapProductId(env);
  const res = await fetch(`${PRINTFUL_API}/products/${productId}`, {
    headers: { Authorization: `Bearer ${env.PRINTFUL_API_KEY}` },
  });
  if (!res.ok) {
    throw new Error(`Printful catalog lookup failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { result: { variants: CatalogVariant[] } };
  cachedVariants = data.result.variants;
  return cachedVariants;
}

// Finds the variant_id for a given Printful color name (e.g. "Black/Natural").
// Otto 31-069 is one-size, so color is the only thing that varies. Tries an exact
// match first, then falls back to a substring match either direction so small naming
// differences (e.g. "Black" vs "Black/Black") don't hard-fail — but throws with the
// full list of real available colors if nothing matches, so a bad guess in HAT_CATALOG
// surfaces immediately instead of silently ordering the wrong color.
async function findVariantId(env: PrintfulEnv, colorName: string): Promise<number> {
  const variants = await getCapVariants(env);
  const wanted = colorName.toLowerCase();

  let match = variants.find((v) => v.color.toLowerCase() === wanted);
  if (!match) {
    match = variants.find(
      (v) => v.color.toLowerCase().includes(wanted) || wanted.includes(v.color.toLowerCase())
    );
  }
  if (!match) {
    const available = variants.map((v) => v.color).join(", ");
    throw new Error(`No Otto 31-069 variant found for color "${colorName}". Available: ${available}`);
  }
  return match.id;
}

// One buyable hat = one design placed on one cap color, with the placement technique
// (embroidery vs. DTF print) and thread/ink color that actually shows up on that cap.
// This is the single source of truth for "what hats can someone buy" — /merch reads
// this list to render buy buttons, and the webhook reads it to build the Printful order.
//
// CONFIRMED LIST (per John, 2026-07-28) — both designs now have all 6 colors
// John asked for (12 hats total), all embroidery, all backed by a real
// Printful mockup photo. White and Black caps each come in two thread-color
// variants; Cream only comes in one thread color per bill color (so it's
// really "6 thread/cap combos," not 6 distinct cap colors):
//   Fist Bump:   White/orange, White/black, Black/white, Black/orange,
//                Cream+Black-bill/black, Cream+Green-bill/orange
//   Upside Down: White/black, White/orange, Black/white, Black/orange,
//                Cream+Black-bill/black, Cream+Green-bill/orange
// "Orange" is Dudela's rust brand color (#a3492b).
export interface HatConfig {
  slug: string; // matches the `product` value used in Stripe metadata / create-checkout-session.ts
  label: string;
  colorName: string; // short display name for the swatch/UI, e.g. "Navy"
  swatchHex: string; // approximate hex for the color-picker dot on /merch
  printfulColor: string; // exact Printful catalog color name for Otto 31-069
  design: "fistbump" | "upsidedown";
  technique: "embroidery" | "dtf";
  // Hex color for embroidery thread OR print ink, per placement.
  frontColor: string;
  backColor?: string; // fist-bump design only — DUDELA wordmark on the back
  frontFileUrl: string;
  backFileUrl?: string;
}

// Thread colors, read directly off the real Printful mockups (not guessed).
const THREAD_BLACK = "#000000";
const THREAD_WHITE = "#FFFFFF";
// Dudela rust — used on the newer solid/cross-combo colors.
// NOTE: was "#a3492b" (Dudela's exact brand rust) but Printful's embroidery thread
// palette for the Otto 31-069 doesn't carry that hex — confirmed via a live 400
// response from the Orders API (2026-07-31): "thread_colors_back option is missing
// or incorrect! Allowed values: #FFFFFF, #000000, #96A1A8, #A67843, #FFCC00,
// #E25C27, #CC3366, #CC3333, #660000, #333366, #005397, #3399FF, #6B5294,
// #01784E, #7BA35A". #E25C27 is the closest allowed thread color and is nearly
// identical to Dudela's actual brand amber (#E27D25) — swapped to that. Worth a
// quick visual check against a real Printful mockup before this goes live.
const THREAD_ORANGE = "#E25C27";

function fistbumpVariant(
  slug: string,
  label: string,
  colorName: string,
  swatchHex: string,
  printfulColor: string,
  threadColor: string
): HatConfig {
  return {
    slug,
    label,
    colorName,
    swatchHex,
    printfulColor,
    design: "fistbump",
    technique: "embroidery",
    frontColor: threadColor,
    backColor: threadColor,
    frontFileUrl: "https://thedudelaco.com/printful/fist-bump-front.png",
    backFileUrl: "https://thedudelaco.com/printful/dudela-wordmark-back.png",
  };
}

function upsidedownVariant(
  slug: string,
  label: string,
  colorName: string,
  swatchHex: string,
  printfulColor: string,
  threadColor: string
): HatConfig {
  return {
    slug,
    label,
    colorName,
    swatchHex,
    printfulColor,
    design: "upsidedown",
    technique: "embroidery",
    frontColor: threadColor,
    frontFileUrl: "https://thedudelaco.com/printful/dudela-upsidedown-front.png",
  };
}

export const HAT_CATALOG: HatConfig[] = [
  // Fist Bump — 6 colors/thread combos
  fistbumpVariant("hat-fistbump-cream", "Cream Hat, Black Bill — Fist Bump", "Cream, Black Bill", "#ece3d1", "Black/Natural", THREAD_BLACK),
  fistbumpVariant("hat-fistbump-black", "Black Hat — Fist Bump", "Black", "#141414", "Black", THREAD_WHITE),
  fistbumpVariant("hat-fistbump-blackorange", "Black Hat, Orange Stitch — Fist Bump", "Black, Orange Stitch", "#141414", "Black", THREAD_ORANGE),
  fistbumpVariant("hat-fistbump-white", "White Hat — Fist Bump", "White", "#f5f5f0", "White", THREAD_ORANGE),
  fistbumpVariant("hat-fistbump-whiteblack", "White Hat, Black Stitch — Fist Bump", "White, Black Stitch", "#f5f5f0", "White", THREAD_BLACK),
  fistbumpVariant("hat-fistbump-green", "Cream Hat, Green Bill — Fist Bump", "Cream, Green Bill", "#3a4a32", "Dark Green/Natural", THREAD_ORANGE),

  // Upside Down — 6 colors/thread combos. Cream/Green-bill is the hero color —
  // re-shot with the wordmark re-stitched in rust orange instead of green (the
  // original green-on-green thread/bill combo didn't match), per John 2026-07-28.
  upsidedownVariant("hat-upsidedown-cream", "Cream Hat, Green Bill — Upside Down", "Cream, Green Bill", "#3a4a32", "Dark Green/Natural", THREAD_ORANGE),
  upsidedownVariant("hat-upsidedown-blackbill", "Cream Hat, Black Bill — Upside Down", "Cream, Black Bill", "#ece3d1", "Black/Natural", THREAD_BLACK),
  upsidedownVariant("hat-upsidedown-black", "Black Hat — Upside Down", "Black", "#141414", "Black", THREAD_WHITE),
  upsidedownVariant("hat-upsidedown-blackorange", "Black Hat, Orange Stitch — Upside Down", "Black, Orange Stitch", "#141414", "Black", THREAD_ORANGE),
  upsidedownVariant("hat-upsidedown-white", "White Hat — Upside Down", "White", "#f5f5f0", "White", THREAD_BLACK),
  upsidedownVariant("hat-upsidedown-whiteorange", "White Hat, Orange Stitch — Upside Down", "White, Orange Stitch", "#f5f5f0", "White", THREAD_ORANGE),
];

export function getHatConfig(slug: string): HatConfig | undefined {
  return HAT_CATALOG.find((h) => h.slug === slug);
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

// Builds the v2 `placements` array for one order item, keyed off the hat's technique.
//
// This is v2 shape, not v1 — that distinction is the whole story here. v1's Orders API
// (POST /orders) takes a flat `files: [{type, url, options: [{id, value}]}]` array, and
// its own error responses reported placement-specific option ids like
// "thread_colors_front_large" / "thread_colors_back" as what it wanted. Every fix
// attempt on 2026-07-31 supplied exactly those ids, in every structurally plausible
// location (nested in the file, nested in a sibling item-level `options` array) — all
// four attempts got back the identical "Following options are missing or incorrect:
// thread_colors_front_large, thread_colors_back!" 400, unchanged. The ids were never
// the problem: v1's validator for this catalog product (Otto 31-069, id 952) simply
// doesn't work, full stop, regardless of what's sent — confirmed by testing the
// deployed source per request via Cloudflare's scriptVersion field in the logs, so
// this wasn't a stale-deploy illusion either.
//
// Printful's real, current API is v2, which uses an entirely different design model:
// each `placement` (e.g. "embroidery_front_large") carries its own `layers`, and each
// file layer's thread-color option is just "thread_colors" (no placement suffix — the
// placement is already scoped one level up, unlike v1's flat namespace where every
// option id had to encode its own placement). Confirmed against Printful's own
// published v2 API docs (developers.printful.com/docs/v2-preview), which show this
// exact shape — `layers: [{ type: "file", url, layer_options: [{ name: "thread_colors",
// value: [...] }] }]` — in their embroidery example. Placement names
// ("embroidery_front_large" / "embroidery_back") carry over unchanged from v1/the
// catalog schema. DTF/print placements use a plain "front" placement with no
// layer_options (ink color is baked into the artwork file itself, so frontColor above
// is informational/for reference — DTF designs should already be pre-colored PNGs).
function buildPlacements(hat: HatConfig) {
  if (hat.technique !== "embroidery") {
    return [
      {
        placement: "front",
        technique: "dtf",
        layers: [{ type: "file", url: hat.frontFileUrl }],
      },
    ];
  }

  const placements: Array<Record<string, unknown>> = [
    {
      placement: "embroidery_front_large",
      technique: "embroidery",
      layers: [
        {
          type: "file",
          url: hat.frontFileUrl,
          layer_options: [{ name: "thread_colors", value: [hat.frontColor] }],
        },
      ],
    },
  ];

  if (hat.backFileUrl) {
    placements.push({
      placement: "embroidery_back",
      technique: "embroidery",
      layers: [
        {
          type: "file",
          url: hat.backFileUrl,
          layer_options: [{ name: "thread_colors", value: [hat.backColor || hat.frontColor] }],
        },
      ],
    });
  }

  return placements;
}

// Places a real order with Printful for one hat. Called from the Stripe webhook on
// checkout.session.completed for merch products — this is what makes the whole thing
// "Printful does everything": no manual packing/shipping on John's end.
//
// NOTE: test-fired against the live Orders API on 2026-07-31 via John's first real hat
// purchase (Fist Bump, Cream/Green Bill). Rounds 1-4 (all against v1's POST /orders)
// never got past a 400 — see the comment above buildPlacements for the full story on
// why v1 was abandoned. Round 5 switched to v2 (POST /v2/orders, then POST
// /v2/orders/{id}/confirmation), matching the request shape straight off Printful's
// own published v2 docs. Unlike v1, a v2 order is always created in "draft" status —
// it does NOT start production on its own — so this now does a second call to confirm
// it immediately after creating it, which is what actually kicks off fulfillment.
// Still recommend placing one real test order per remaining color/design combo and
// checking the resulting mockup/thread color before turning off manual review — this
// has only been verified end-to-end for the Fist Bump embroidery_front_large +
// embroidery_back combination.
// v2 caps external_id at 32 characters — Stripe checkout session ids ("cs_live_...")
// run to 66+, which v2 rejects outright ("External ID validation error. Maximum
// external_id string length is 32, provided external_id has 66 characters"; v1 had
// no such limit, which is why this wasn't needed before the v2 migration). Hashing
// down to a fixed 32-char hex digest keeps it deterministic per session id (so this
// stays idempotent-ish/traceable, same intent as before) without truncating into a
// shared prefix that could theoretically collide.
async function shortExternalId(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export async function createPrintfulOrder(
  env: PrintfulEnv,
  opts: { hatSlug: string; recipient: PrintfulRecipient; externalId: string }
): Promise<{ id: number; status: string }> {
  const hat = getHatConfig(opts.hatSlug);
  if (!hat) throw new Error(`Unknown hat slug "${opts.hatSlug}" — not in HAT_CATALOG`);

  const variantId = await findVariantId(env, hat.printfulColor);

  const body = {
    external_id: await shortExternalId(opts.externalId), // see shortExternalId — v2 caps this at 32 chars
    recipient: opts.recipient,
    order_items: [
      {
        source: "catalog",
        catalog_variant_id: variantId,
        quantity: 1,
        placements: buildPlacements(hat),
      },
    ],
  };

  const createRes = await fetch(`${PRINTFUL_API}/v2/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.PRINTFUL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!createRes.ok) {
    throw new Error(`Printful order create failed: ${createRes.status} ${await createRes.text()}`);
  }
  const created = (await createRes.json()) as { data: { id: number; status: string } };

  const confirmRes = await fetch(`${PRINTFUL_API}/v2/orders/${created.data.id}/confirmation`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.PRINTFUL_API_KEY}` },
  });
  if (!confirmRes.ok) {
    // The order does exist at this point (just stuck in draft) — surface its id in the
    // error so it's easy to find and confirm manually in Printful's dashboard instead
    // of it silently sitting there unfulfilled.
    throw new Error(
      `Printful order ${created.data.id} was created but confirmation failed: ${confirmRes.status} ${await confirmRes.text()}`
    );
  }
  const confirmed = (await confirmRes.json()) as { data: { id: number; status: string } };
  return confirmed.data;
}
