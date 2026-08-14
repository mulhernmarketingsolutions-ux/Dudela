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
// "Dudela Hat — The Classic, Black / Natural Bill (Rust Orange Stitching, Dude to Dad Stitch)"
export function hatLabel(v: HatVariant): string {
  const addonPart = v.addon ? ", Dude to Dad Stitch" : "";
  return `Dudela Hat — ${v.designLabel}, ${v.colorLabel} (${v.threadLabel} Stitching${addonPart})`;
}

// "38.00" for a plain hat, "39.00" with the Dude to Dad side-stitch add-on
// (+$1). Not read anywhere yet as the literal Stripe charge (checkout adds
// the $1 as its own line item — see create-checkout-session.ts), but kept
// accurate here since it's the one place that documents the real per-variant
// price, and receipt copy (stripe-webhook.ts PRODUCTS) derives from it.
export function hatPrice(v: HatVariant): string {
  return v.addon ? "39.00" : "38.00";
}

// ---------------------------------------------------------------------------
// SHIRTS
// ---------------------------------------------------------------------------
// Unlike hats (a curated subset of design/thread/addon/color combos — not
// every combination physically exists), every shirt design × color × year ×
// size really is fully buyable, a clean cross product. So instead of
// hand-typing every variant block like HAT_CATALOG, SHIRT_CATALOG is
// generated from one row per (color, year) — each row's sizeSyncVariantIds
// is the real, verified S→4XL sync_variant_id list read directly from
// /api/admin/printful-debug?all=1 for that row's Sync Product, not
// assumed/guessed (see SHIRT_SYNC_VARIANT_IDS below).
export type ShirtSize = "S" | "M" | "L" | "XL" | "2XL" | "3XL" | "4XL";
export const SHIRT_SIZES: ShirtSize[] = ["S", "M", "L", "XL", "2XL", "3XL", "4XL"];

export type ShirtYear = "2024" | "2025" | "2026" | "2027";
export const SHIRT_YEARS: ShirtYear[] = ["2024", "2025", "2026", "2027"];

// Real S→4XL sync_variant_id lists, read from /api/admin/printful-debug?all=1
// on 2026-08-14. Each of the 8 (color, year) sync products below returns its
// variants in the same fixed order every time (verified — every year for a
// given color shares the exact same catalog_variant_id sequence, e.g. Black
// is always 15114,15115,15116,15117,15118,16326,17500 and Ivory is always
// 16523,16524,16525,16526,16527,16528,17507 — the last id in each list jumps
// noticeably higher than the rest, consistent with 4XL having been added to
// Printful's catalog later than S–3XL), so index 0..6 reliably maps to
// SHIRT_SIZES' S..4XL order.
const SHIRT_SYNC_VARIANT_IDS: Record<string, number[]> = {
  "black-2024": [5441021900, 5441021901, 5441021902, 5441021903, 5441021904, 5441021905, 5441021906],
  "black-2025": [5441025638, 5441025639, 5441025640, 5441025641, 5441025642, 5441025643, 5441025644],
  "black-2026": [5441004732, 5441004733, 5441004734, 5441004735, 5441004736, 5441004737, 5441004738],
  "black-2027": [5441026510, 5441026511, 5441026512, 5441026513, 5441026514, 5441026515, 5441026516],
  "ivory-2024": [5441028829, 5441028830, 5441028831, 5441028832, 5441028833, 5441028834, 5441028835],
  "ivory-2025": [5441029476, 5441029477, 5441029478, 5441029479, 5441029480, 5441029481, 5441029482],
  "ivory-2026": [5441030461, 5441030462, 5441030463, 5441030464, 5441030465, 5441030466, 5441030467],
  "ivory-2027": [5441031325, 5441031326, 5441031327, 5441031328, 5441031329, 5441031330, 5441031331],
};

export interface ShirtVariant {
  key: string; // `shirt-${design}-${color}-${year}-${size}` (lowercase) — the checkout `product` value
  design: string;
  designLabel: string;
  color: string;
  colorLabel: string;
  colorHex: string;
  year: ShirtYear;
  size: ShirtSize;
  syncVariantId: number;
  price: string; // "40.00" — every size/color/year of a given design is the same price
  frontImage: string;
  backImage: string;
  // A tight crop of the actual chest-logo print file (not the full-body
  // lifestyle photo) on a flat brand-color card — the lifestyle photo alone
  // makes the logo too small to actually read at product-card size. Sourced
  // directly from the real Printful print file per color (white ink on
  // Black, black ink on Ivory) and per year, not a crop of the lifestyle
  // photo, since that photo looks visibly soft/blurry once cropped in
  // tight — see public/images/shirts/shirt-*-logo-detail.png.
  logoDetailImage: string;
}

interface ShirtDesignColorYearRow {
  design: string;
  designLabel: string;
  color: string;
  colorLabel: string;
  colorHex: string;
  year: ShirtYear;
  frontImage: string;
  backImage: string;
  logoDetailImage: string;
  price: string;
  // [S, M, L, XL, 2XL, 3XL, 4XL] — same order as SHIRT_SIZES
  sizeSyncVariantIds: number[];
}

const SHIRT_COLORS = [
  { color: "black", colorLabel: "Black", colorHex: "#141414" },
  { color: "ivory", colorLabel: "Ivory", colorHex: "#e9dfc7" },
] as const;

const SHIRT_DESIGN_COLORS: ShirtDesignColorYearRow[] = SHIRT_COLORS.flatMap(({ color, colorLabel, colorHex }) =>
  SHIRT_YEARS.map((year) => ({
    design: "dad-est",
    designLabel: `DAD EST. ${year}`,
    color,
    colorLabel,
    colorHex,
    year,
    frontImage: `/images/shirts/shirt-${color}-${year}-front.png`,
    backImage: `/images/shirts/shirt-${color}-${year}-back.png`,
    logoDetailImage: `/images/shirts/shirt-${color}-${year}-logo-detail.png`,
    price: "40.00",
    sizeSyncVariantIds: SHIRT_SYNC_VARIANT_IDS[`${color}-${year}`] || [0, 0, 0, 0, 0, 0, 0],
  }))
);

export const SHIRT_CATALOG: ShirtVariant[] = SHIRT_DESIGN_COLORS.flatMap((row) =>
  SHIRT_SIZES.map((size, i) => ({
    key: `shirt-${row.design}-${row.color}-${row.year}-${size.toLowerCase()}`,
    design: row.design,
    designLabel: row.designLabel,
    color: row.color,
    colorLabel: row.colorLabel,
    colorHex: row.colorHex,
    year: row.year,
    size,
    syncVariantId: row.sizeSyncVariantIds[i],
    price: row.price,
    frontImage: row.frontImage,
    backImage: row.backImage,
    logoDetailImage: row.logoDetailImage,
  }))
);

export function getShirtVariant(key: string): ShirtVariant | undefined {
  return SHIRT_CATALOG.find((s) => s.key === key);
}

// Readable label for receipts/internal notification emails — e.g.
// "Dudela Shirt — DAD EST. 2026, Black, Size M"
export function shirtLabel(v: ShirtVariant): string {
  return `Dudela Shirt — ${v.designLabel}, ${v.colorLabel}, Size ${v.size}`;
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
// CORRECTION (2026-08-13): the claim below that "v1 has no character limit"
// was wrong and caused every single order — hat and shirt, test and real —
// to fail with Printful's "Invalid External ID specified" 400. Printful's
// own docs (developers.printful.com/docs/#Orders-create, "External ID"
// section) are explicit: external_id is capped at 32 characters and may
// only contain digits, Latin letters, dashes and underscores — this applies
// to v1 too, not just v2. The raw Stripe session id (`cs_live_...`, ~66
// chars) blew past that on every real webhook order, and
// `admin-test-${key}-${timestamp}` blew past it on every admin test-order
// call. Callers must now build external_id via shortExternalId() below
// instead of passing a raw id straight through.
// Printful caps external_id at 32 characters (digits, Latin letters, dashes,
// underscores only — see the correction above createPrintfulOrder). Anything
// short enough and clean enough to fit is passed through as-is (readable in
// the Printful dashboard); anything longer or containing other characters
// (Stripe session ids like "cs_live_...", or "admin-test-<key>-<timestamp>"
// strings) is hashed down to a 32-char hex id instead. Hashing is
// deterministic — the same input always produces the same output — so
// update_existing=true still dedupes a redelivered Stripe webhook onto the
// same Printful order rather than creating a duplicate.
export async function shortExternalId(raw: string): Promise<string> {
  if (raw.length <= 32 && /^[A-Za-z0-9_-]+$/.test(raw)) return raw;
  const bytes = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export async function createPrintfulOrder(
  env: PrintfulEnv,
  opts: {
    syncVariantId: number;
    // Extra items to include in the SAME Printful order as syncVariantId
    // above — used for the hat+shirt bundle, so a bundle buyer gets one
    // Printful order/one Stripe charge instead of two separate orders.
    // Whether that also means one physical package isn't guaranteed —
    // Printful can still split one order into multiple shipments (their
    // "partial" status) if items are produced on different lines/timelines,
    // e.g. embroidery vs. DTG print — so this is "simpler to track," not
    // "ships in one box." Empty/omitted for every other (single-item)
    // purchase, which is why syncVariantId above stays a required single
    // value rather than folding everything into one items[] array — it
    // keeps every existing single-item caller (real webhook orders, the
    // hat/shirt admin test tools) unchanged.
    extraSyncVariantIds?: number[];
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
    items: [opts.syncVariantId, ...(opts.extraSyncVariantIds || [])].map((id) => ({
      sync_variant_id: id,
      quantity: 1,
    })),
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
