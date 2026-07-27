// `Response.redirect()` (the static helper) returns a Response whose headers
// are immutable on the Cloudflare Workers runtime. Astro attaches any
// queued `cookies.set()`/`cookies.delete()` calls by injecting a Set-Cookie
// header into whatever Response the route returns — which throws
// "TypeError: Can't modify immutable headers" the instant a cookie was
// touched earlier in the same request. That crash isn't caught by
// try/catch in the route (it happens downstream, after the route already
// returned) or by src/middleware.ts, so it surfaces as a raw Cloudflare
// "Error 1101" page. First hit on /api/auth/verify (session cookie), then
// again on /api/auth/logout (cookie deletion) — any route that both
// touches a cookie and redirects needs this instead of Response.redirect().
export function redirectTo(origin: string, path: string) {
  const location = path.startsWith("http") ? path : `${origin}${path}`;
  return new Response(null, { status: 302, headers: { Location: location } });
}
