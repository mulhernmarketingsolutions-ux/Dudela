import type { APIContext } from "astro";
import { deletePost } from "../../../lib/db";
import { isAdminAuthed } from "../../../lib/auth";

export const prerender = false;

// Lets John/Mike clear out placeholder or mistaken Womb Watch posts from
// /admin/womb-watch without needing to touch the D1 console directly.
export async function POST({ request, locals, cookies }: APIContext) {
  const env = (locals as any).runtime.env;
  const url = new URL(request.url);

  const authed = await isAdminAuthed(cookies, env);
  if (!authed) {
    return new Response(null, { status: 302, headers: { Location: `${url.origin}/admin/login` } });
  }

  const form = await request.formData();
  const id = (form.get("id") || "").toString().trim();
  if (id) {
    await deletePost(env, id);
  }

  return new Response(null, { status: 302, headers: { Location: `${url.origin}/admin/womb-watch?deleted=1` } });
}
