import type { APIContext } from "astro";
import { upsertCommunityNote } from "../../../lib/db";
import { getAuthedMember } from "../../../lib/auth";

export const prerender = false;

const MAX_NAME = 40;
const MAX_CITY = 60;
const MAX_ADVICE = 160;

// Gated "share yours" form on /member/community. One bubble per member —
// upsertCommunityNote overwrites their existing entry if they submit again,
// so editing your bubble is just resubmitting the form.
export async function POST({ request, locals, cookies }: APIContext) {
  const env = (locals as any).runtime.env;

  const member = await getAuthedMember(cookies, env);
  if (!member) {
    return new Response(JSON.stringify({ ok: false, error: "Please log in again." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const form = await request.formData();
  const firstName = (form.get("first_name") || "").toString().trim().slice(0, MAX_NAME);
  const city = (form.get("city") || "").toString().trim().slice(0, MAX_CITY);
  const dadStage = (form.get("dad_stage") || "").toString().trim();
  const advice = (form.get("advice") || "").toString().trim().slice(0, MAX_ADVICE);

  if (!firstName || !advice) {
    return new Response(JSON.stringify({ ok: false, error: "First name and one thing you've learned are both required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    await upsertCommunityNote(env, { memberId: member.id, firstName, city, dadStage, advice });
  } catch (err) {
    console.error("Community note save failed:", err);
    return new Response(JSON.stringify({ ok: false, error: "Something went wrong. Please try again." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
