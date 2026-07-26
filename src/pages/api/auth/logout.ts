import type { APIContext } from "astro";
import { deleteSession } from "../../../lib/db";
import { SESSION_COOKIE, clearSessionCookie } from "../../../lib/auth";

export const prerender = false;

export async function POST({ request, locals, cookies }: APIContext) {
  const env = (locals as any).runtime.env;
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      await deleteSession(env, token);
    } catch (err) {
      console.error("Session delete failed:", err);
    }
  }
  clearSessionCookie(cookies);
  const url = new URL(request.url);
  return Response.redirect(`${url.origin}/member/login`, 302);
}

// Also handle plain GET so a simple <a href="/api/auth/logout"> link works
// without needing a form + JS.
export async function GET(context: APIContext) {
  return POST(context);
}
