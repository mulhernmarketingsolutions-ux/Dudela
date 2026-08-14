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

  // ?download=<comma-separated mockup URLs> — the generator's mockup_url/extra[].url
  // values live on printful-upload's S3 "tmp/" prefix, which is not meant to be
  // hotlinked long-term. This fetches each one (through the Worker, since our
  // own sandbox tooling can't reach printful-upload's S3 host directly) and
  // returns it as base64 so it can be saved as a permanent static asset in the
  // site repo instead. Keep batches small (a handful of URLs per call) —
  // base64 inflates payload size ~33%, and this is meant to be pulled through
  // a browser JSON view, not streamed.
  const download = url.searchParams.get("download");
  if (download) {
    const urls = download.split(",").map((u) => u.trim()).filter(Boolean);
    const results = await Promise.all(
      urls.map(async (u) => {
        try {
          const res = await fetch(u);
          if (!res.ok) return { url: u, error: `HTTP ${res.status}` };
          const buf = await res.arrayBuffer();
          let binary = "";
          const bytes = new Uint8Array(buf);
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          return { url: u, base64: btoa(binary) };
        } catch (e) {
          return { url: u, error: String(e) };
        }
      })
    );
    return new Response(JSON.stringify({ results }), { headers: { "Content-Type": "application/json" } });
  }

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
    // Optional substring filter on product name — lets a re-run target just
    // the products that need fixing (e.g. ?filter=Rookie) instead of
    // re-generating mockups for every product again.
    const nameFilter = url.searchParams.get("filter");

    const listRes = await pf("/sync/products?limit=100");
    const listData = (await listRes.json()) as { result: Array<{ id: number; name: string }> };
    const filtered = nameFilter
      ? listData.result.filter((p) => p.name.toLowerCase().includes(nameFilter.toLowerCase()))
      : listData.result;
    const slice = filtered.slice(offset, offset + chunkSize);

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
        // Real sync_variant.files use the short type "left" for the side add-on
        // file (its filename embeds "embroidery_left", but the `type` field
        // itself is just "left") — matching only "embroidery_left" here meant
        // this never matched anything, so the Dude² Dad side text was silently
        // missing from every mockup generated so far, on every WithAddOn
        // variant. Accept both spellings so this actually gets included.
        const leftFile = first.files.find((f) => f.type === "left" || f.type === "embroidery_left");
        const threadFront = first.options.find((o) => o.id === "thread_colors_front_large")?.value;
        // Same story on the option id — the left file on the real add-on
        // variants carries its thread color under "text_thread_colors_left"
        // (it's stitched text, not a graphic), not "thread_colors_left" (which
        // is empty). Prefer whichever one is actually populated.
        const threadLeftGraphic = first.options.find((o) => o.id === "thread_colors_left")?.value;
        const threadLeftText = first.options.find((o) => o.id === "text_thread_colors_left")?.value;
        const threadLeft = Array.isArray(threadLeftGraphic) && threadLeftGraphic.length ? threadLeftGraphic : threadLeftText;

        // The sync/products API doesn't expose each variant's saved position (that's
        // only visible in the Design Maker UI) — these are approximations of the
        // real sizing dialed in there, tuned per design rather than one-size-
        // fits-all. The Classic's wordmark is a wide graphic meant to run
        // nearly the full front width, centered — 4.5x2.19 confirmed correct
        // via a side-by-side check against the Design Maker. The Rookie's
        // fist-bump icon is a completely different, much smaller graphic
        // placed off-center (small logo look, not a full front graphic) — its
        // real size (2.53 x 1.33in) IS exposed in the Design Maker's
        // Width/Height readout, so that part isn't a guess; only its exact
        // left/top offset is estimated from the Design Maker's rendered
        // preview (right-of-center, roughly mid-height).
        const isRookie = p.name.toLowerCase().includes("rookie");
        const FRONT_AREA = { area_width: 6.3, area_height: 2.55 };
        const FRONT_SIZE = isRookie ? { width: 2.53, height: 1.33 } : { width: 4.5, height: 2.19 };
        const FRONT_POSITION = isRookie
          ? { top: 1.05, left: 3.4 } // off-center, small — matches the real Design Maker placement
          : {
              top: (FRONT_AREA.area_height - FRONT_SIZE.height) / 2,
              left: (FRONT_AREA.area_width - FRONT_SIZE.width) / 2,
            };
        const LEFT_AREA = { area_width: 2.0, area_height: 1.0 };
        const LEFT_SIZE = { width: 1.6, height: 0.8 }; // 600x300 source aspect, ~80% of area height

        const files: Array<Record<string, unknown>> = [];
        if (frontFile) {
          files.push({
            placement: "embroidery_front_large",
            image_url: frontFile.preview_url,
            position: {
              ...FRONT_AREA,
              ...FRONT_SIZE,
              ...FRONT_POSITION,
            },
          });
        }
        if (leftFile) {
          files.push({
            placement: "embroidery_left",
            image_url: leftFile.preview_url,
            position: {
              ...LEFT_AREA,
              ...LEFT_SIZE,
              top: (LEFT_AREA.area_height - LEFT_SIZE.height) / 2,
              left: (LEFT_AREA.area_width - LEFT_SIZE.width) / 2,
            },
          });
        }

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
