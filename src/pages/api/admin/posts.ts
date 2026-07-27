import type { APIContext } from "astro";
import { createPost, listActiveMembers } from "../../../lib/db";
import { isAdminAuthed } from "../../../lib/auth";
import { sendMemberNotificationEvent } from "../../../lib/loops";
import { redirectTo } from "../../../lib/http";

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
    return redirectTo(url.origin, "/admin/login");
  }

  const form = await request.formData();
  const title = (form.get("title") || "").toString().trim();
  const body = (form.get("body") || "").toString().trim();
  const category = (form.get("category") || "womb-watch").toString().trim();
  const videoUrl = (form.get("video_url") || "").toString().trim();
  const thumbnailUrl = (form.get("thumbnail_url") || "").toString().trim();
  const weekLabel = (form.get("week_label") || "").toString().trim();

  if (!title || !body) {
    return redirectTo(url.origin, "/admin/womb-watch?error=missing-fields");
  }

  await createPost(env, { title, body, category, videoUrl, thumbnailUrl, weekLabel });

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

  return redirectTo(url.origin, "/admin/womb-watch?posted=1");
}
