import type { APIContext } from "astro";
import { upsertMemberFromStripe, createMagicLink } from "../../lib/db";
import { sendEmail } from "../../lib/email";
import { sendLoopsPurchaseEvent } from "../../lib/loops";
import { redirectTo } from "../../lib/http";

export const prerender = false;

// Free Spit-Up Society signup (Oct 2026: membership went free, no Stripe).
// Creates (or reactivates) the member row, emails a one-click login link,
// fires the same Loops member event the paid flow used so the Membership
// Welcome workflow still runs, and pings dude@ internally.

function welcomeEmailHtml(opts: { name: string; url: string }) {
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
            You're in the Spit-Up Society. It's free. Here's your one-click link into the member area,
            where Womb Watch, the members-only podcast, and Ask John &amp; Mike live.
          </p>
          <div style="text-align:center;margin:30px 0 26px;">
            <a href="${opts.url}" style="display:inline-block;background:#e27d25;color:#12180f;padding:15px 30px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">
              Go to the member area
            </a>
          </div>
          <p style="color:#4a5540;font-size:13px;line-height:1.6;margin:0;">
            This link expires in 20 minutes and works once. Anytime after, log in at thedudelaco.com/member/login with this email.
          </p>
        </div>
      </div>
    </div>
  `;
}

export async function POST({ request, locals }: APIContext) {
  const env = (locals as any).runtime.env;
  const origin = new URL(request.url).origin;

  const form = await request.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const name = String(form.get("name") || "").trim();
  // Honeypot: real people never fill this hidden field.
  if (form.get("company")) return redirectTo(origin, "/join/spit-up-society/thank-you");

  if (!email || !email.includes("@")) {
    return redirectTo(origin, "/join/spit-up-society?error=email#join-form");
  }

  try {
    await upsertMemberFromStripe(env, { email, name: name || undefined, product: "spit-up-society" });
  } catch (err) {
    console.error("Free member upsert failed:", err);
    return redirectTo(origin, "/join/spit-up-society?error=server#join-form");
  }

  try {
    const token = await createMagicLink(env, email);
    await sendEmail(env, {
      to: email,
      subject: "You're in the Spit-Up Society",
      html: welcomeEmailHtml({ name, url: `${origin}/api/auth/verify?token=${token}` }),
    });
  } catch (err) {
    console.error("Free member welcome email failed:", err);
  }

  try {
    await sendLoopsPurchaseEvent(env, { email, name: name || undefined, product: "spit-up-society", source: "free-join" });
  } catch (err) {
    console.error("Free member Loops event failed:", err);
  }

  try {
    await sendEmail(env, {
      to: env.NOTIFY_EMAIL || "dude@thedudelaco.com",
      subject: `New member (free) — ${email}`,
      html: `<p>New free Spit-Up Society member: <strong>${name || "(no name)"}</strong> &lt;${email}&gt;</p>`,
      replyTo: email,
    });
  } catch (err) {
    console.error("Free member notify failed:", err);
  }

  return redirectTo(origin, "/join/spit-up-society/thank-you");
}
