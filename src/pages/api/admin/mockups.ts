import type { APIContext } from "astro";
import { isAdminAuthed } from "../../../lib/auth";

export const prerender = false;

// Temporary admin tool — generates fresh, transparent-background mockup pairs
// (straight-on "Front" + 3/4 "Left Front", so you can see the side) for every
// published hat product, using Printful's real embroidery files/thread colors
// already stored on each synced variant. Read-only against orders/money —
// mockup generation is free. Safe to delete once the real catalog data (lib +
// merch.astro) is rebuilt around the results.
//
// Flow (two calls, since generation is async on Printful's side):
//   1. GET ?start=1   -> kicks off one generation task per product, returns task keys
//   2. GET ?poll=<comma-separated task keys> -> checks status, returns finished mockup URLs
//
// format:"png" is what gets us a transparent background — per Printful's own
// docs: "PNG will have a transparent background, JPG will have a smaller
// file size." No extra flag needed.
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
    // Chunked on purpose — Printful rate-limits mockup-generator create-task
    // to ~10/60s, and firing all 12 products at once (Promise.all) tripped
    // that limit on the first pass. Process a small slice per call instead:
    // ?start=1&offset=0 then &offset=4, &offset=8, etc.
    const offset = Number(url.searchParams.get("offset") || "0");
    const chunkSize = 4;

    const listRes = await pf("/sync/products?limit=100");
    const listData = (await listRes.json()) as { result: Array<{ id: number; name: string }> };
    const slice = listData.result.slice(offset, offset + chunkSize);

    const tasks = await Promise.all(
      slice.map(async (p) => {
        const res = await pf(`/sync/products/${p.id}`);
        const data = (await res.json()) as {
          result: {
            sync_variants: Array<{
              variant_id: number;
              files: Array<{ type: string; preview_url: string }>;
              options: Array<{ id: string; value: unknown }>;
            }>;
          };
        };
        const variants = data.result.sync_variants;
        const first = variants[0];

        const frontFile = first.files.find((f) => f.type === "embroidery_front_large");
        const leftFile = first.files.find((f) => f.type === "embroidery_left");
        const threadFront = first.options.find((o) => o.id === "thread_colors_front_large")?.value;
        const threadLeft = first.options.find((o) => o.id === "thread_colors_left")?.value;

        const files: Array<Record<string, unknown>> = [];
        if (frontFile) files.push({ placement: "embroidery_front_large", image_url: frontFile.preview_url });
        if (leftFile) files.push({ placement: "embroidery_left", image_url: leftFile.preview_url });

        const product_options: Record<string, unknown> = {};
        if (threadFront) product_options.thread_colors_front_large = threadFront;
        if (threadLeft) product_options.thread_colors_left = threadLeft;

        const createRes = await pf("/mockup-generator/create-task/952", {
          method: "POST",
          body: JSON.stringify({
            variant_ids: variants.map((v) => v.variant_id),
            format: "png",
            option_groups: ["Flat"],
            options: ["Front", "Left Front"],
            product_options,
            files,
          }),
        });
        const createData = (await createRes.json()) as any;
        return {
          product_id: p.id,
          product_name: p.name,
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
