import type { APIContext } from "astro";
import { addComment } from "../../../lib/db";
import { getAuthedMember } from "../../../lib/auth";

export const prerender = false;

const MAX_BODY = 600;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export async function POST({ request, locals, cookies }: APIContext) {
  const env = (locals as any).runtime.env;

  const member = await getAuthedMember(cookies, env);
  if (!member) {
    return new Response(JSON.stringify({ ok: false, error: "Please log in again." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const payload = await request.json().catch(() => null);
  const postId = payload?.postId?.toString();
  const commentBody = (payload?.body || "").toString().trim().slice(0, MAX_BODY);

  if (!postId || !commentBody) {
    return new Response(JSON.stringify({ ok: false, error: "Say something first." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // First name only, on-brand and a little more casual than a full legal
  // name showing up next to a comment about nausea and cinnamon rolls.
  const authorName = (member.name || member.email.split("@")[0] || "A dad in the Society").trim().split(/\s+/)[0];

  try {
    const comment = await addComment(env, { postId, memberId: member.id, authorName, body: commentBody });
    return new Response(
      JSON.stringify({
        ok: true,
        comment: { id: comment.id, authorName: comment.author_name, body: comment.body, date: formatDate(comment.created_at) },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Comment save failed:", err);
    return new Response(JSON.stringify({ ok: false, error: "Something went wrong. Please try again." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
