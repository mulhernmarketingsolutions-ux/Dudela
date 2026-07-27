import type { APIContext } from "astro";
import { consumeMagicLink, createSession } from "../../../lib/db";
import { setSessionCookie } from "../../../lib/auth";
import { redirectTo } from "../../../lib/http";

export const prerender = false;

// Step 2 of magic-link login: member clicks the link from their email,
// lands here with ?token=..., we burn the token, create a 30-day session,
// set the cookie, and send them into the gated dashboard.
export async function GET({ request, locals, cookies }: APIContext) {
  const env = (locals as any).runtime.env;
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";

  if (!token) {
    return redirectTo(url.origin,"/member/login?error=missing-token");
  }

  try {
    const result = await consumeMagicLink(env, token);
    if (result.status === "invalid") {
      return redirectTo(url.origin,"/member/login?error=expired");
    }
    if (result.status === "not-a-member") {
      return redirectTo(url.origin,"/member/login?error=not-a-member");
    }
    const session = await createSession(env, result.member.id);
    setSessionCookie(cookies, session.token);
    return redirectTo(url.origin,"/member/dashboard");
  } catch (err) {
    console.error("Magic link verify failed:", err);
    return redirectTo(url.origin,"/member/login?error=server");
  }
}
