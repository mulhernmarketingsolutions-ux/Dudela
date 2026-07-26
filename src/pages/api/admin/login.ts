import type { APIContext } from "astro";
import { createAdminSession } from "../../../lib/db";
import { setAdminSessionCookie } from "../../../lib/auth";

export const prerender = false;

// Single shared password for the Womb Watch posting UI (John + Mike only —
// not per-person accounts). Set the ADMIN_PASSWORD secret with:
//   wrangler secret put ADMIN_PASSWORD
export async function POST({ request, locals, cookies }: APIContext) {
  const env = (locals as any).runtime.env;
  const url = new URL(request.url);

  const form = await request.formData();
  const password = (form.get("password") || "").toString();

  if (!env.ADMIN_PASSWORD) {
    console.error("ADMIN_PASSWORD secret is not set");
    return Response.redirect(`${url.origin}/admin/login?error=not-configured`, 302);
  }

  if (password !== env.ADMIN_PASSWORD) {
    return Response.redirect(`${url.origin}/admin/login?error=wrong-password`, 302);
  }

  const token = await createAdminSession(env);
  setAdminSessionCookie(cookies, token);
  return Response.redirect(`${url.origin}/admin/womb-watch`, 302);
}
