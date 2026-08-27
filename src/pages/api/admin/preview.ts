import type { APIContext } from "astro";
import { isAdminAuthed, setPreviewMemberCookie, clearPreviewMemberCookie } from "../../../lib/auth";
import { getMemberById } from "../../../lib/db";

export const prerender = false;

// Admin's "Preview as a subscriber" control (see the panel on /admin).
// Plain GET links/redirects rather than a POST+fetch round trip — same
// pattern the rest of the admin tools already use (test-hat-order.ts,
// printful-debug.ts, etc.), since this is an admin-only, idempotent
// cookie flip, not a public-facing form.
export async function GET({ request, cookies, redirect, locals }: APIContext) {
  const env = (locals as any).runtime.env;
  const authed = await isAdminAuthed(cookies, env);
  if (!authed) {
    return new Response("Admin login required.", { status: 401 });
  }

  const url = new URL(request.url);

  if (url.searchParams.has("exit")) {
    clearPreviewMemberCookie(cookies);
    return redirect("/admin");
  }

  const memberId = url.searchParams.get("memberId");
  if (!memberId) {
    return new Response("Missing memberId.", { status: 400 });
  }
  const member = await getMemberById(env, memberId);
  if (!member) {
    return new Response("No member with that id.", { status: 404 });
  }

  setPreviewMemberCookie(cookies, member.id);
  return redirect("/member/dashboard");
}
