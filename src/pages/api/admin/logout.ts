import type { APIContext } from "astro";
import { deleteAdminSession } from "../../../lib/db";
import { ADMIN_SESSION_COOKIE, clearAdminSessionCookie } from "../../../lib/auth";

export const prerender = false;

export async function GET({ request, locals, cookies }: APIContext) {
  const env = (locals as any).runtime.env;
  const token = cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (token) {
    try {
      await deleteAdminSession(env, token);
    } catch (err) {
      console.error("Admin session delete failed:", err);
    }
  }
  clearAdminSessionCookie(cookies);
  const url = new URL(request.url);
  return Response.redirect(`${url.origin}/admin/login`, 302);
}
