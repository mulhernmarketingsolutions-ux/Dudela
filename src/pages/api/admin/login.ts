import type { APIContext } from "astro";
import { createAdminSession } from "../../../lib/db";
import { setAdminSessionCookie } from "../../../lib/auth";
import { redirectTo } from "../../../lib/http";

export const prerender = false;

// Single shared password for the whole /admin area — Womb Watch posting,
// hat/shirt order testing, mockup/debug tools (John + Mike only, not
// per-person accounts). Set the ADMIN_PASSWORD secret with:
//   wrangler secret put ADMIN_PASSWORD
export async function POST({ request, locals, cookies }: APIContext) {
  const env = (locals as any).runtime.env;
  const url = new URL(request.url);

  const form = await request.formData();
  const password = (form.get("password") || "").toString();

  if (!env.ADMIN_PASSWORD) {
    console.error("ADMIN_PASSWORD secret is not set");
    return redirectTo(url.origin, "/admin/login?error=not-configured");
  }

  if (password !== env.ADMIN_PASSWORD) {
    return redirectTo(url.origin, "/admin/login?error=wrong-password");
  }

  const token = await createAdminSession(env);
  setAdminSessionCookie(cookies, token);
  return redirectTo(url.origin, "/admin");
}
