import type { APIContext } from "astro";
import { createInquiry } from "../../../lib/db";
import { getAuthedMember } from "../../../lib/auth";
import { sendEmail } from "../../../lib/email";

export const prerender = false;

// Gated "Ask a Question" form on /member/ask — logs the question to D1 so
// John/Mike can review the backlog, and sends an immediate internal email
// so a good question for the next live Q&A doesn't get missed.
export async function POST({ request, locals, cookies }: APIContext) {
  const env = (locals as any).runtime.env;

  const member = await getAuthedMember(cookies, env);
  if (!member) {
    return new Response(JSON.stringify({ ok: false, error: "Please log in again." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const contentType = request.headers.get("content-type") || "";
  let body: Record<string, string>;
  if (contentType.includes("application/json")) {
    body = await request.json();
  } else {
    const form = await request.formData();
    body = Object.fromEntries(form.entries()) as Record<string, string>;
  }

  const question = (body.question || "").trim();
  if (!question) {
    return new Response(JSON.stringify({ ok: false, error: "Add a question first." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    await createInquiry(env, { memberEmail: member.email, memberName: member.name || undefined, question });
  } catch (err) {
    console.error("Inquiry save failed:", err);
    return new Response(JSON.stringify({ ok: false, error: "Something went wrong. Please try again." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    await sendEmail(env, {
      to: env.NOTIFY_EMAIL || "dude@thedudelaco.com",
      subject: `New member question — ${member.name || member.email}`,
      html: `<div style="font-family: sans-serif; color: #1c2319; max-width: 480px;">
        <p><strong>From:</strong> ${member.name || "(no name)"} &lt;${member.email}&gt;</p>
        <p><strong>Question:</strong><br/>${question.replace(/\n/g, "<br/>")}</p>
      </div>`,
      replyTo: member.email,
    });
  } catch (err) {
    console.error("Inquiry notify email failed:", err);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
