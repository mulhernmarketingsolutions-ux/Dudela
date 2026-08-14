import type { APIContext } from "astro";
import { isAdminAuthed } from "../../../lib/auth";

export const prerender = false;

// Temporary admin-only inspection tool — NOT used by any real page. Lets us see
// the exact real shape of Printful's Sync Product API response (variant colors,
// sync_variant_id, mockup preview URLs) before writing the real catalog-sync
// script, instead of guessing field names from docs and burning a deploy cycle
// on a wrong guess. Safe to delete once lib/printful-catalog.ts is built and
// working — this never touches orders, never spends money, read-only.
//
// Usage (while logged in at /admin/login):
//   /api/admin/printful-debug                 -> list every published sync product (id, name, variant count)
//   /api/admin/printful-debug?id=161636640     -> full raw JSON for one product, including its variants' files/mockups
export async function GET({ request, locals, cookies }: APIContext) {
  const env = (locals as any).runtime.env;

  const authed = await isAdminAuthed(cookies, env);
  if (!authed) {
    return new Response(JSON.stringify({ error: "Not logged in. Visit /admin/login first." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  // ?styles=1 — list every mockup camera-angle/style Printful offers for the
  // Otto Cap 31-069 (catalog product 952), so we can pick the exact style_ids
  // for "front flat" and "front, tilted to show the left side" instead of
  // guessing ids blind. Flat/product-only styles are the ones that support a
  // transparent background — lifestyle/model shots don't.
  // ?template=<id> — fetches the real Product Template behind a sync product
  // (Design Maker's saved data: exact placement position/size for every
  // print file), so we can find out whether the mockup-generator preview
  // photos actually match what's really configured, instead of the guessed
  // position mockups.ts had to use (sync/products doesn't expose this).
  if (url.searchParams.get("template")) {
    const res = await fetch(`https://api.printful.com/product-templates/${url.searchParams.get("template")}`, {
      headers: { Authorization: `Bearer ${env.PRINTFUL_API_KEY}` },
    });
    const text = await res.text();
    return new Response(text, { status: res.status, headers: { "Content-Type": "application/json" } });
  }

  // ?printfiles=<catalog_product_id> — the print area dimensions (width/height,
  // dpi) for every placement a product supports (front/back/etc for a
  // t-shirt) — needed to build a mockup-generator files[] position the same
  // way FRONT_AREA/LEFT_AREA were sourced for the caps, instead of guessing.
  if (url.searchParams.get("printfiles")) {
    const res = await fetch(`https://api.printful.com/mockup-generator/printfiles/${url.searchParams.get("printfiles")}`, {
      headers: { Authorization: `Bearer ${env.PRINTFUL_API_KEY}` },
    });
    const text = await res.text();
    return new Response(text, { status: res.status, headers: { "Content-Type": "application/json" } });
  }

  if (url.searchParams.get("styles") === "1") {
    const res = await fetch("https://api.printful.com/v2/catalog-products/952/mockup-styles", {
      headers: { Authorization: `Bearer ${env.PRINTFUL_API_KEY}` },
    });
    const text = await res.text();
    return new Response(text, { status: res.status, headers: { "Content-Type": "application/json" } });
  }

  // ?all=1 — loop every published sync product and return only the fields
  // the site actually needs (name, color, sync_variant_id, retail price, the
  // real photographic mockup URL) instead of Printful's full verbose payload
  // per product. Built so we only need ONE deployed call instead of one
  // request per product (12 round trips) to build the site's new catalog.
  if (url.searchParams.get("all") === "1") {
    const listRes = await fetch("https://api.printful.com/sync/products?limit=100", {
      headers: { Authorization: `Bearer ${env.PRINTFUL_API_KEY}` },
    });
    const listData = (await listRes.json()) as { result: Array<{ id: number; name: string }> };

    const products = await Promise.all(
      listData.result.map(async (p) => {
        const res = await fetch(`https://api.printful.com/sync/products/${p.id}`, {
          headers: { Authorization: `Bearer ${env.PRINTFUL_API_KEY}` },
        });
        const data = (await res.json()) as {
          result: {
            sync_product: { id: number; name: string };
            sync_variants: Array<{
              id: number;
              name: string;
              color: string;
              retail_price: string;
              variant_id: number;
              product: { image: string };
              files: Array<{ type: string; preview_url: string }>;
            }>;
          };
        };
        return {
          id: data.result.sync_product.id,
          name: data.result.sync_product.name,
          variants: data.result.sync_variants.map((v) => ({
            sync_variant_id: v.id,
            color: v.color,
            retail_price: v.retail_price,
            catalog_variant_id: v.variant_id,
            mockup_url: v.files.find((f) => f.type === "preview")?.preview_url || null,
          })),
        };
      })
    );

    return new Response(JSON.stringify({ products }, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const path = id ? `/sync/products/${id}` : `/sync/products?limit=100`;

  const res = await fetch(`https://api.printful.com${path}`, {
    headers: { Authorization: `Bearer ${env.PRINTFUL_API_KEY}` },
  });
  const text = await res.text();

  return new Response(text, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
