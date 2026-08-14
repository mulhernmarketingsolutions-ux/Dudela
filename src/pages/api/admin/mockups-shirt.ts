import type { APIContext } from "astro";
import { isAdminAuthed } from "../../../lib/auth";

export const prerender = false;

// SUPERSEDED as the source of the live public/images/shirts/*.png files
// (2026-08-13): the front position/size this script guesses below turned out
// wrong — real placement is a small left-chest hit, not centered — the same
// class of bug the Rookie hat hit earlier. Rather than re-guess new numbers,
// the live front/back photos were pulled directly from Printful's dashboard
// "Choose mockups" export (Products → DUDELA Shirt / Ivory → Edit design →
// Basic mockups → Download all mockups), which renders using the product's
// real saved placement — no guessing required. This script is kept around
// as a working reference for the async create-task/poll flow and for
// regenerating FLAT/ghost-style images if ever needed, but is not what's
// live on /merch today.
//
// Sibling to mockups.ts, kept as a separate file rather than extending that
// one — shirts are DTG prints (front/back placements, catalog product 586)
// with completely different area math than the caps' embroidery placements,
// and mixing the two increases the risk of breaking the working hat
// pipeline while iterating on this one. Same two-call async flow:
//   1. GET ?start=1   -> kicks off one generation task per shirt color
//   2. GET ?poll=<comma-separated task keys> -> checks status, returns mockup URLs
//
// Only one mockup pair (front + back) is generated per COLOR, not per size —
// every size shares the same print file and placement, so there's no need
// to burn a separate mockup-generator call per size the way HAT_CATALOG
// needed one per (design, thread, add-on) combo.
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
  const pf = (path: string, init?: RequestInit) =>
    fetch(`https://api.printful.com${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${env.PRINTFUL_API_KEY}`, "Content-Type": "application/json" },
    });

  const poll = url.searchParams.get("poll");
  if (poll) {
    const keys = poll.split(",").map((k) => k.trim()).filter(Boolean);
    const results = await Promise.all(
      keys.map(async (key) => {
        const res = await pf(`/mockup-generator/task?task_key=${encodeURIComponent(key)}`);
        const data = (await res.json()) as any;
        return { task_key: key, ...data.result };
      })
    );
    return new Response(JSON.stringify({ results }, null, 2), { headers: { "Content-Type": "application/json" } });
  }

  if (url.searchParams.get("start") === "1") {
    // Real print-area dimensions for catalog product 586 (Comfort Colors
    // 1717 tee) — confirmed via /api/admin/printful-debug?printfiles=586:
    // printfile_id 1 (front AND back) is 1800x2400px @ 150dpi = 12in x 16in.
    const AREA = { area_width: 12, area_height: 16 };

    // Real per-color placement sizes read directly off each product's
    // Design Maker (Width/Height readout, not guessed) — front is the same
    // "DAD EST. 2026" chest hit on both colors but was uploaded/cropped
    // slightly differently per color; back is the same DUDELA fist-bump
    // wordmark, also cropped differently per color (confirmed by viewing
    // the actual back file for both — same artwork, different crop box).
    // Position (top/left) IS a real gap in Printful's API (sync/products
    // doesn't expose it, same issue the caps hit) — centered horizontally
    // for front, and for back sized/positioned to match each file's own
    // aspect ratio within the print area, is the best estimate available
    // short of Printful exposing real placement data.
    const SHIRTS: Array<{
      product_id: number;
      color: string;
      variant_id: number; // one representative catalog variant id (any size) — mockup is shared across sizes
      front: { width: number; height: number; top: number; left: number };
      back: { width: number; height: number; top: number; left: number };
    }> = [
      {
        product_id: 455805171,
        color: "Black",
        variant_id: 15115, // DUDELA Shirt / M
        front: { width: 7.43, height: 9.55, top: 2, left: (12 - 7.43) / 2 },
        back: { width: 11.66, height: 14.99, top: (16 - 14.99) / 2, left: (12 - 11.66) / 2 },
      },
      {
        product_id: 455805870,
        color: "Ivory",
        variant_id: 16524, // Dudela Shirt - Ivory / M
        front: { width: 7.59, height: 9.75, top: 2, left: (12 - 7.59) / 2 },
        back: { width: 12.0, height: 8.0, top: (16 - 8.0) / 2, left: 0 },
      },
    ];

    const tasks = await Promise.all(
      SHIRTS.map(async (shirt) => {
        const res = await pf(`/sync/products/${shirt.product_id}`);
        const data = (await res.json()) as {
          result: {
            sync_variants: Array<{
              variant_id: number;
              files: Array<{ type: string; preview_url: string }>;
            }>;
          };
        };
        const variants = data.result.sync_variants;
        const rep = variants.find((v) => v.variant_id === shirt.variant_id) || variants[0];

        const frontFile = rep.files.find((f) => f.type === "default");
        const backFile = rep.files.find((f) => f.type === "back");

        const files: Array<Record<string, unknown>> = [];
        if (frontFile) {
          files.push({
            placement: "front",
            image_url: frontFile.preview_url,
            position: { ...AREA, ...shirt.front },
          });
        }
        if (backFile) {
          files.push({
            placement: "back",
            image_url: backFile.preview_url,
            position: { ...AREA, ...shirt.back },
          });
        }

        const createRes = await pf("/mockup-generator/create-task/586", {
          method: "POST",
          body: JSON.stringify({
            variant_ids: [shirt.variant_id],
            format: "png",
            option_groups: ["Flat"],
            options: ["Front", "Back"],
            files,
          }),
        });
        const createData = (await createRes.json()) as any;
        return {
          product_id: shirt.product_id,
          color: shirt.color,
          task_key: createData?.result?.task_key || null,
          error: createData?.error || null,
        };
      })
    );

    return new Response(JSON.stringify({ tasks }, null, 2), { headers: { "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ error: "Pass ?start=1 or ?poll=<task_keys>" }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}
