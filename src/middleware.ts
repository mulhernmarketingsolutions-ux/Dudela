import { defineMiddleware } from "astro:middleware";

// Site-wide safety net. Astro's built-in src/pages/500.astro only covers
// exceptions thrown while rendering a .astro page — it does NOT cover an
// uncaught throw inside an API route handler (src/pages/api/**), which
// otherwise bubbles all the way up to the Cloudflare Worker runtime and
// shows the visitor a raw "Error 1101 — Worker threw exception" page. That's
// exactly what happened on /api/auth/verify for an edge case that wasn't
// wrapped in its own try/catch (now fixed there directly, but this wrapper
// exists so no *future* uncaught error in any API route ever does the same
// thing again).
//
// API routes get a small JSON error body instead of a redirect, since
// whatever's calling them (fetch() from a form, an email client following a
// link) needs a well-formed response either way — pages get sent to the
// branded /500 page.
export const onRequest = defineMiddleware(async (context, next) => {
  try {
    return await next();
  } catch (err) {
    console.error("Unhandled error in", context.url.pathname, err);
    if (context.url.pathname.startsWith("/api/")) {
      return new Response(
        JSON.stringify({ ok: false, error: "Something went wrong on our end. Please try again." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    return context.redirect("/500");
  }
});
