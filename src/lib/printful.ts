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
// CONFIRMED LIST (per John, 2026-07-27) — 2 designs, 3 colors each, all embroidered.
// Dropped the cream/green-bill colorway from BOTH designs per John: "the greens
// don't match so i'm going with these other designs" — it's also no longer on his
// real Printful product list. Every combo below is backed by a real Printful mockup
// John generated and dropped into public/images/ — thread colors aren't guessed,
// they're read straight off those photos:
//   Fist Bump:   Cream/Black-bill (black thread), Black (white thread), White (orange thread)
//   Upside Down: Black (white thread), White (orange thread), Cream/Black-bill (black thread)
// "Orange" is Dudela's rust brand color (#a3492b) — it's what showed up consistently
// across John's later mockup batches once he moved past the original 2 colors, so
// it's treated as his settled choice for the newer solid-color/cross combos.
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
const THREAD_ORANGE = "#a3492b"; // Dudela rust — used on the newer solid/cross-combo colors

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
  // Fist Bump — 3 colors
  fistbumpVariant("hat-fistbump-cream", "Cream Hat, Black Bill — Fist Bump", "Cream, Black Bill", "#ece3d1", "Black/Natural", THREAD_BLACK),
  fistbumpVariant("hat-fistbump-black", "Black Hat — Fist Bump", "Black", "#141414", "Black", THREAD_WHITE),
  fistbumpVariant("hat-fistbump-white", "White Hat — Fist Bump", "White", "#f5f5f0", "White", THREAD_ORANGE),

  // Upside Down — 3 colors
  upsidedownVariant("hat-upsidedown-black", "Black Hat — Upside Down", "Black", "#141414", "Black", THREAD_WHITE),
  upsidedownVariant("hat-upsidedown-white", "White Hat — Upside Down", "White", "#f5f5f0", "White", THREAD_ORANGE),
  upsidedownVariant("hat-upsidedown-blackbill", "Cream Hat, Black Bill — Upside Down", "Cream, Black Bill", "#ece3d1", "Black/Natural", THREAD_BLACK),
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
// Embroidery placements use "embroidery_front"/"embroidery_back" placement keys and
// carry a thread-color option; DTF/print placements use plain "front" and have no
// thread option (ink color is baked into the artwork file itself, so frontColor above
// is informational/for reference — DTF designs should already be pre-colored PNGs).
function buildFiles(hat: HatConfig) {
  const files: Array<Record<string, unknown>> = [];

  if (hat.technique === "embroidery") {
    files.push({
      type: "embroidery_front",
      url: hat.frontFileUrl,
      options: [{ id: "thread_colors", value: [hat.frontColor] }],
    });
    if (hat.backFileUrl) {
      files.push({
        type: "embroidery_back",
        url: hat.backFileUrl,
        options: [{ id: "thread_colors", value: [hat.backColor || hat.frontColor] }],
      });
    }
  } else {
    files.push({ type: "front", url: hat.frontFileUrl });
  }

  return files;
}

// Places a real order with Printful for one hat. Called from the Stripe webhook on
// checkout.session.completed for merch products — this is what makes the whole thing
// "Printful does everything": no manual packing/shipping on John's end.
//
// NOTE: the exact shape of the embroidery `options` / thread_colors field should be
// confirmed against a real (or Printful's sandbox/confirmation-mode) order before this
// goes fully live — Printful's docs describe the field but this hasn't been test-fired
// against the live API yet. Recommend placing one real test order per hat and checking
// the resulting mockup/thread color before turning off manual review.
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
