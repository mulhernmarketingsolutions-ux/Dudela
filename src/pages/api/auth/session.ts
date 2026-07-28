import type { APIContext } from "astro";
import { getAuthedMember } from "../../../lib/auth";

export const prerender = false;

// Lightweight session check for prerendered/static marketing pages. Those
// pages can't call getAuthedMember server-side (no per-request cookie access
// at build time — see the comment on Nav.astro's `isAuthed` prop), so Nav's
// client script hits this instead: a tiny JSON check that reads the same
// session cookie the gated /member/* pages already trust, so "Member Login"
// can flip to the logged-in icon treatment on ANY page, not just the ones
// that were server-rendered with auth already resolved.
export async function GET({ cookies, locals }: APIContext) {
  const env = (locals as any).runtime.env;
  const member = await getAuthedMember(cookies, env);
  return new Response(JSON.stringify({ authed: !!member }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
