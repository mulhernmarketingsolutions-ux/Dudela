import type { APIContext } from "astro";
import { consumeMagicLink, createSession } from "../../../lib/db";
import { setSessionCookie } from "../../../lib/auth";

export const prerender = false;

// `Response.redirect()` (the static helper) returns a Response whose headers
// are immutable on the Cloudflare Workers runtime. That's fine on its own,
// but Astro's cookie handling works by queuing cookies.set() calls and then
// injecting the resulting Set-Cookie header into whatever Response the route
// returns — which throws "TypeError: Can't modify immutable headers" the
// moment a cookie was set earlier in the same request. That's exactly what
// happened here: setSessionCookie() queues the session cookie, then
// Response.redirect() below couldn't accept it and crashed with a raw
// Cloudflare Error 1101. Building the redirect manually with `new Response()`
// keeps the headers mutable so Astro can attach the cookie safely.
function redirectTo(url: URL, path: string) {
  return new Response(null, {
    status: 302,
    headers: { Location: `${url.origin}${path}` },
  });
}

// Step 2 of magic-link login: member clicks the link from their email,
// lands here with ?token=..., we burn the token, create a 30-day session,
// set the cookie, and send them into the gated dashboard.
export async function GET({ request, locals, cookies }: APIContext) {
  const env = (locals as any).runtime.env;
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";

  if (!token) {
    return redirectTo(url, "/member/login?error=missing-token");
  }

  try {
    const result = await consumeMagicLink(env, token);
    if (result.status === "invalid") {
      return redirectTo(url, "/member/login?error=expired");
    }
    if (result.status === "not-a-member") {
      return redirectTo(url, "/member/login?error=not-a-member");
    }
    const session = await createSession(env, result.member.id);
    setSessionCookie(cookies, session.token);
    return redirectTo(url, "/member/dashboard");
  } catch (err) {
    console.error("Magic link verify failed:", err);
    return redirectTo(url, "/member/login?error=server");
  }
}
