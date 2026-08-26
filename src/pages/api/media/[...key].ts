import type { APIContext } from "astro";
import { getAuthedMember } from "../../../lib/auth";

export const prerender = false;

// Streams a Womb Watch video straight out of the private R2 bucket
// (WOMB_WATCH_MEDIA — see wrangler.toml), gated by the same member session
// as every other /member page. This is why videos live here instead of on
// YouTube/Vimeo: the privacy boundary is "are you logged in," not "do you
// have the link" — the bucket itself has public access disabled, so this
// route is the *only* way to reach the file at all.
//
// Supports HTTP Range requests so the native <video> player in
// member/womb-watch.astro can scrub/seek instead of only ever playing from
// the start — browsers request video in ranges by default once playback
// begins.
export async function GET({ params, request, cookies, locals }: APIContext) {
  const env = (locals as any).runtime.env;

  const member = await getAuthedMember(cookies, env);
  if (!member) {
    return new Response("Not authorized", { status: 401 });
  }

  const key = Array.isArray(params.key) ? params.key.join("/") : (params.key as string) || "";
  if (!key) {
    return new Response("Not found", { status: 404 });
  }

  const bucket = env.WOMB_WATCH_MEDIA;
  const head = await bucket.head(key);
  if (!head) {
    return new Response("Not found", { status: 404 });
  }

  const total = head.size as number;
  const headers = new Headers();
  head.writeHttpMetadata(headers);
  headers.set("etag", head.httpEtag);
  headers.set("accept-ranges", "bytes");
  // Private member content — never cached by a shared/CDN cache, and never
  // indexed if a crawler somehow reaches it while logged in as a bot.
  headers.set("cache-control", "private, max-age=3600");
  headers.set("x-robots-tag", "noindex");

  const rangeHeader = request.headers.get("range");
  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (match) {
      const [, startStr, endStr] = match;
      let start: number;
      let end: number;
      if (startStr === "") {
        // Suffix range, e.g. "bytes=-500" -> last 500 bytes.
        const suffixLength = Number(endStr);
        start = Math.max(total - suffixLength, 0);
        end = total - 1;
      } else {
        start = Number(startStr);
        end = endStr === "" ? total - 1 : Math.min(Number(endStr), total - 1);
      }
      if (start <= end && start < total) {
        const obj = await bucket.get(key, { range: { offset: start, length: end - start + 1 } });
        if (obj) {
          headers.set("content-range", `bytes ${start}-${end}/${total}`);
          headers.set("content-length", String(end - start + 1));
          return new Response(obj.body, { status: 206, headers });
        }
      }
    }
  }

  const obj = await bucket.get(key);
  if (!obj) {
    return new Response("Not found", { status: 404 });
  }
  headers.set("content-length", String(total));
  return new Response(obj.body, { status: 200, headers });
}
