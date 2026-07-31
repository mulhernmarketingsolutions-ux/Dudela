// Thin wrapper around Printful's REST API (v1) — same lightweight fetch pattern as
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

// Builds the `files` array for one order item, keyed off the hat's technique.
// Embroidery placements use "embroidery_front_large"/"embroidery_back" placement keys
// (confirmed against the live Otto 31-069 product — plain "embroidery_front" is
// rejected with "Incorrect file type... Allowed file types for this product:
// front_dtf_hat, embroidery_front_large, embroidery_back, embroidery_left,
// embroidery_right, mockup") and carry a placement-specific thread-color option
// ("thread_colors_front_large"/"thread_colors_back" — a shared generic "thread_colors"
// id is rejected as missing/incorrect per placement).
//
// Root cause of the "thread_colors_front_large, thread_colors_back missing or
// incorrect" 400 (found 2026-07-31 by reading this exact product's live option
// schema off printful.com's own product page, via its Apollo GraphQL cache —
// CatalogProduct id 952): the front placement's thread_colors_front_large option
// is only valid/required when the file ALSO carries an explicit
// "embroidery_type": "flat" option (Printful's schema: thread_colors_front_large's
// `required` condition is `{fileTypes:[embroidery_front_large], options:
// {embroidery_type:[flat]}}`) — the catalog page shows "flat" as embroidery_type's
// default, but the Orders API does not appear to apply that default on its own, so
// omitting it entirely made Printful treat the front (and, in the same validation
// pass, the back) thread-color option as unsatisfied. Adding it explicitly is the
// fix. DTF/print placements use plain "front" and have no thread option (ink color
// is baked into the artwork file itself, so frontColor above is informational/for
// reference — DTF designs should already be pre-colored PNGs).
function buildFiles(hat: HatConfig) {
  const files: Array<Record<string, unknown>> = [];

  if (hat.technique === "embroidery") {
    files.push({
      type: "embroidery_front_large",
      url: hat.frontFileUrl,
      options: [{ id: "thread_colors_front_large", value: [hat.frontColor] }],
    });
    if (hat.backFileUrl) {
      files.push({
        type: "embroidery_back",
        url: hat.backFileUrl,
        options: [{ id: "thread_colors_back", value: [hat.backColor || hat.frontColor] }],
      });
    }
  } else {
    files.push({ type: "front", url: hat.frontFileUrl });
  }

  return files;
}

// "embroidery_type" (flat / 3D puff / partial 3D puff) is a technique choice for the
// whole item, not a per-placement one — it lives in the item's own top-level `options`
// array, as a sibling to `files`, not nested inside one file's options. Confirmed off
// this exact product's live option schema (Otto 31-069, catalog id 952, read via
// printful.com's own product-page GraphQL cache): thread_colors_front_large's
// `required` condition needs embroidery_type="flat" to be set, and "flat" (no upcharge)
// matches every hat in HAT_CATALOG since none opt into the paid 3D puff options.
function buildItemOptions(hat: HatConfig) {
  return hat.technique === "embroidery" ? [{ id: "embroidery_type", value: "flat" }] : [];
}

// Places a real order with Printful for one hat. Called from the Stripe webhook on
// checkout.session.completed for merch products — this is what makes the whole thing
// "Printful does everything": no manual packing/shipping on John's end.
//
// NOTE: test-fired against the live Orders API on 2026-07-31 via John's first real
// hat purchase (Fist Bump, Cream/Green Bill) — took several rounds to get a clean
// 400-free request: wrong embroidery placement type, wrong thread-color option ids, an
// out-of-palette thread hex, and a missing required "embroidery_type" option that
// turned out to need to live at the item level (buildItemOptions), not nested inside
// the front file's own options like the thread-color ones (all fixed in
// buildFiles/buildItemOptions/THREAD_ORANGE above). Still recommend placing one real
// test order per remaining color/design combo and checking the resulting
// mockup/thread color before turning off manual review — this fix has only been
// verified for the Fist Bump embroidery_front_large + embroidery_back combination.
export async function createPrintfulOrder(
  env: PrintfulEnv,
  opts: { hatSlug: string; recipient: PrintfulRecipient; externalId: string }
): Promise<{ id: number; status: string }> {
  const hat = getHatConfig(opts.hatSlug);
  if (!hat) throw new Error(`Unknown hat slug "${opts.hatSlug}" — not in HAT_CATALOG`);

  const variantId = await findVariantId(env, hat.printfulColor);

  const body = {
    external_id: opts.externalId, // Stripe checkout session id — keeps this idempotent-ish and traceable
    recipient: opts.recipient,
    items: [
      {
        variant_id: variantId,
        quantity: 1,
        files: buildFiles(hat),
        options: buildItemOptions(hat),
      },
    ],
  };

  const res = await fetch(`${PRINTFUL_API}/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.PRINTFUL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Printful order create failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { result: { id: number; status: string } };
  return data.result;
}
