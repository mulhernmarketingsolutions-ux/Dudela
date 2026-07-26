import type { APIContext } from "astro";
import { createPost, listActiveMembers } from "../../../lib/db";
import { isAdminAuthed } from "../../../lib/auth";
import { sendMemberNotificationEvent } from "../../../lib/loops";

export const prerender = false;

// Publishes a new Womb Watch post from /admin/womb-watch, then best-effort
// notifies every active member via Loops (see lib/loops.ts — requires the
// matching Workflow to exist in Loops for members to actually receive
// anything). A slow/failed notification never blocks the post itself from
// saving.
export async function POST({ request, locals, cookies }: APIContext) {
  const env = (locals as any).runtime.env;
  const url = new URL(request.url);

  const authed = await isAdminAuthed(cookies, env);
  if (!authed) {
    return Response.redirect(`${url.origin}/admin/login`, 302);
  }

  const form = await request.formData();
  const title = (form.get("title") || "").toString().trim();
  const body = (form.get("body") || "").toString().trim();
  const category = (form.get("category") || "womb-watch").toString().trim();

  if (!title || !body) {
    return Response.redirect(`${url.origin}/admin/womb-watch?error=missing-fields`, 302);
  }

  await createPost(env, { title, body, category });

  try {
    const members = await listActiveMembers(env);
    await Promise.allSettled(
      members.map((m) =>
        sendMemberNotificationEvent(env, {
          email: m.email,
          firstName: m.name ? m.name.split(" ")[0] : undefined,
          category,
          userGroup: "Member – Spit-Up Society",
        })
      )
    );
  } catch (err) {
    console.error("Member notification fan-out failed:", err);
  }

  return Response.redirect(`${url.origin}/admin/womb-watch?posted=1`, 302);
}
