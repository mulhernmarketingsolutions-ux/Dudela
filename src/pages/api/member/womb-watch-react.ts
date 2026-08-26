import type { APIContext } from "astro";
import { toggleReaction } from "../../../lib/db";
import { getAuthedMember } from "../../../lib/auth";

export const prerender = false;

// Fixed set — keep in sync with REACTION_KINDS in member/womb-watch.astro.
// Validated server-side too so a crafted request can't write an arbitrary
// reaction string into the table.
const VALID_REACTIONS = new Set(["been-there", "needed-this", "same-boat"]);

export async function POST({ request, locals, cookies }: APIContext) {
  const env = (locals as any).runtime.env;

  const member = await getAuthedMember(cookies, env);
  if (!member) {
    return new Response(JSON.stringify({ ok: false, error: "Please log in again." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await request.json().catch(() => null);
  const postId = body?.postId?.toString();
  const reaction = body?.reaction?.toString();

  if (!postId || !reaction || !VALID_REACTIONS.has(reaction)) {
    return new Response(JSON.stringify({ ok: false, error: "Invalid reaction." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const result = await toggleReaction(env, { postId, memberId: member.id, reaction });
    return new Response(JSON.stringify({ ok: true, active: result.active }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Reaction toggle failed:", err);
    return new Response(JSON.stringify({ ok: false, error: "Something went wrong. Please try again." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
