import type { APIContext } from "astro";
import { consumeMagicLink, createSession } from "../../../lib/db";
import { setSessionCookie } from "../../../lib/auth";

export const prerender = false;

// Step 2 of magic-link login: member clicks the link from their email,
// lands here with ?token=..., we burn the token, create a 30-day session,
// set the cookie, and send them into the gated dashboard.
export async function GET({ request, locals, cookies }: APIContext) {
  const env = (locals as any).runtime.env;
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";

  if (!token) {
    return Response.redirect(`${url.origin}/member/login?error=missing-token`, 302);
  }

  try {
    const member = await consumeMagicLink(env, token);
    if (!member) {
      return Response.redirect(`${url.origin}/member/login?error=expired`, 302);
    }
    const session = await createSession(env, member.id);
    setSessionCookie(cookies, session.token);
    return Response.redirect(`${url.origin}/member/dashboard`, 302);
  } catch (err) {
    console.error("Magic link verify failed:", err);
    return Response.redirect(`${url.origin}/member/login?error=server`, 302);
  }
}
