import type { APIContext } from "astro";
import { updatePostAudio } from "../../../lib/db";
import { isAdminAuthed } from "../../../lib/auth";
import { redirectTo } from "../../../lib/http";

export const prerender = false;

// Attaches (or replaces) the full-length audio file for an existing Womb
// Watch post from the inline "Audio" field on /admin/womb-watch. Separate
// from posts.ts's create flow because the 5 already-published episodes need
// audio added after the fact — the audio was recorded/exported after the
// videos were already live (see migrations/0008_womb_watch_audio.sql).
export async function POST({ request, locals, cookies }: APIContext) {
  const env = (locals as any).runtime.env;
  const url = new URL(request.url);

  const authed = await isAdminAuthed(cookies, env);
  if (!authed) {
    return redirectTo(url.origin, "/admin/login");
  }

  const form = await request.formData();
  const id = (form.get("id") || "").toString().trim();
  const audioUrl = (form.get("audio_url") || "").toString().trim();

  if (!id) {
    return redirectTo(url.origin, "/admin/womb-watch?error=missing-fields");
  }

  await updatePostAudio(env, id, audioUrl || null);

  return redirectTo(url.origin, "/admin/womb-watch?audio-updated=1");
}
