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
