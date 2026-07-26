import type { APIContext } from "astro";
import { getMemberByEmail, createMagicLink } from "../../../lib/db";
import { sendEmail } from "../../../lib/email";

export const prerender = false;

// Step 1 of magic-link login: member enters their email on /member/login,
// this looks them up in D1 and — if they're a real member — emails a
// one-click sign-in link (verified by /api/auth/verify.ts).
//
// Deliberately returns the same generic "check your inbox" response whether
// or not the email matches a member, so this endpoint can't be used to probe
// which addresses are Spit-Up Society members.

function magicLinkEmailHtml(opts: { name: string; url: string }) {
  const firstName = opts.name ? opts.name.split(" ")[0] : "there";
  return `
    <div style="background:#12180f;padding:40px 16px;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:460px;margin:0 auto;background:#f5efe3;border-radius:14px;overflow:hidden;">
        <div style="background:#1c2319;padding:26px 32px;text-align:center;">
          <img src="https://thedudelaco.com/logo/dudela-logo-white-full.png" alt="Dudela" style="height:36px;width:auto;display:inline-block;" />
        </div>
        <div style="padding:36px 32px;">
          <p style="color:#1c2319;font-size:17px;line-height:1.6;margin:0 0 18px;">Hey ${firstName},</p>
          <p style="color:#1c2319;font-size:17px;line-height:1.6;margin:0 0 18px;">
            Here's your one-click link into the Spit-Up Society member area:
          </p>
          <div style="text-align:center;margin:30px 0 26px;">
            <a href="${opts.url}" style="display:inline-block;background:#e27d25;color:#12180f;padding:15px 30px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">
              Log In
            </a>
          </div>
          <p style="color:#4a5540;font-size:13px;line-height:1.6;margin:0;">
            This link expires in 20 minutes and works once. Didn't request it? You can ignore this email.
          </p>
        </div>
      </div>
    </div>
  `;
}

export async function POST({ request, locals }: APIContext) {
  const env = (locals as any).runtime.env;

  const contentType = request.headers.get("content-type") || "";
  let body: Record<string, string>;
  if (contentType.includes("application/json")) {
    body = await request.json();
  } else {
    const form = await request.formData();
    body = Object.fromEntries(form.entries()) as Record<string, string>;
  }

  const email = (body.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return new Response(JSON.stringify({ ok: false, error: "A valid email is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const member = await getMemberByEmail(env, email);
    if (member) {
      const origin = new URL(request.url).origin;
      const token = await createMagicLink(env, email);
      const url = `${origin}/api/auth/verify?token=${token}`;
      try {
        await sendEmail(env, {
          to: email,
          subject: "Your Spit-Up Society login link",
          html: magicLinkEmailHtml({ name: member.name || "", url }),
        });
      } catch (err) {
        console.error("Magic link email failed:", err);
      }
    }
  } catch (err) {
    console.error("Magic link lookup/create failed:", err);
    // Still fall through to the generic success response below — we never
    // want this endpoint to reveal whether an email matched a member.
  }

  return new Response(
    JSON.stringify({ ok: true, message: "If that email's on a membership, a login link is on its way." }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
