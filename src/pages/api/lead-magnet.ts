import type { APIContext } from "astro";
import { getGoogleAccessToken, appendSheetRow, GOOGLE_SCOPES } from "../../lib/google";
import { addMailerLiteSubscriber } from "../../lib/mailerlite";
import { sendEmail } from "../../lib/email";

export const prerender = false;

// Handles every lead-magnet form on the site (free guide, checklists, etc).
// 1. Logs the submission to the "Leads" tab of the shared Google Sheet.
// 2. Adds the person to MailerLite so the existing nurture sequence keeps doing its job.
// 3. Sends the submitter a confirmation email (via Resend) — either the real PDF delivery
//    email (if MAGNETS has a hosted file for this magnet) or a generic "you're in" email
//    otherwise (see CONFIRMATIONS below).
// 4. Sends John a quick internal notification email so new leads don't require checking
//    the Google Sheet manually.
//
// Required Cloudflare secrets: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
// GOOGLE_SHEET_ID, MAILERLITE_API_KEY, MAILERLITE_GROUP_ID (optional), RESEND_API_KEY,
// RESEND_FROM_EMAIL, NOTIFY_EMAIL (optional — defaults to dude@thedudelaco.com).
//
// MAGNETS below maps each `magnet` value (sent by the form) to its subject line and the
// PDF's public URL. Drop real PDF files in /public/downloads/ and update the url — until
// then this map is empty-safe: if a magnet isn't listed here, the generic CONFIRMATIONS
// email below is sent instead, so submitters always hear something back.
const MAGNETS: Record<string, { subject: string; fileName: string; url: string }> = {
  "free-guide": {
    subject: "Your free guide — 15 Things Every Dad Should Do Before the Baby Arrives",
    fileName: "Dudela – 15 Things Every Dad Should Do Before the Baby Arrives.pdf",
    url: "https://thedudelaco.com/downloads/dudela-15-things.pdf",
  },
};

// Generic "you're confirmed" copy per magnet, used whenever MAGNETS doesn't have a real
// file wired up yet for that type. Every form on the site posts one of these four values.
const CONFIRMATIONS: Record<string, { subject: string; body: string }> = {
  "free-guide": {
    subject: "You're in — your free Dad Prep Guide is on its way",
    body: "Thanks for grabbing the Free Dad Prep Guide. We're finishing up the download — you'll get a follow-up email with the link very soon. In the meantime, keep an eye on your inbox for the first Dudela Newsletter email.",
  },
  "hat-waitlist": {
    subject: "You're on the Dudela hat waitlist",
    body: "You're on the list for a Dudela hat — $38, free shipping, and a free month of the Spit-Up Society with your order. We'll email you the second they're ready to ship. Tag @the_dudela_official when yours shows up.",
  },
  "fall-cohort-waitlist": {
    subject: "You're on the Fall Cohort waitlist",
    body: "You're on the waitlist for the Steady Dad: Before Birth Workshop / Fall Cohort. We'll email you as soon as dates and spots open up.",
  },
  "newsletter": {
    subject: "You're on the list",
    body: "Welcome to the Dudela Newsletter — one email a week, no fluff. First one lands soon.",
  },
};

// Shared branded shell — dark forest header with the Dudela mark, cream card body,
// amber CTA. Keeps all lead-magnet emails feeling like the site instead of a bare
// system message. Uses email-safe fonts only (no webfonts — most clients strip them).
function emailShell(innerHtml: string) {
  return `
    <div style="background:#12180f;padding:40px 16px;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:460px;margin:0 auto;background:#f5efe3;border-radius:14px;overflow:hidden;">
        <div style="background:#1c2319;padding:26px 32px;text-align:center;">
          <img src="https://thedudelaco.com/logo/dudela-logo-white-full.png" alt="Dudela" style="height:36px;width:auto;display:inline-block;" />
        </div>
        <div style="padding:36px 32px;">
          ${innerHtml}
        </div>
        <div style="padding:0 32px 28px;">
          <p style="color:#8a9280;font-size:12px;line-height:1.5;margin:0;border-top:1px solid #e2d9c4;padding-top:16px;">
            The Dudela Co. &middot; Turning Dudes Into Dads &middot;
            <a href="https://thedudelaco.com" style="color:#8a9280;">thedudelaco.com</a>
          </p>
        </div>
      </div>
    </div>
  `;
}

function deliveryEmailHtml(name: string, magnetInfo: { fileName: string; url: string }) {
  const firstName = name ? name.split(" ")[0] : "there";
  return emailShell(`
    <p style="color:#1c2319;font-size:17px;line-height:1.6;margin:0 0 18px;">Hey ${firstName},</p>
    <p style="color:#1c2319;font-size:17px;line-height:1.6;margin:0 0 18px;">
      Here it is — <strong>15 Things Every Dad Should Do Before the Baby Arrives</strong>.
      Straight from us, no fluff. Save it somewhere you'll actually look at it again.
    </p>
    <div style="text-align:center;margin:30px 0 26px;">
      <a href="${magnetInfo.url}" style="display:inline-block;background:#e27d25;color:#12180f;padding:15px 30px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">
        Download the Guide
      </a>
    </div>
    <p style="color:#4a5540;font-size:14px;line-height:1.6;margin:0 0 4px;">
      Want to go five times deeper? The <a href="https://thedudelaco.com/kit" style="color:#c66815;font-weight:700;text-decoration:none;">Dudela Prep Kit</a> is the next step when you're ready.
    </p>
    <p style="color:#1c2319;font-size:15px;margin:26px 0 0;">— John &amp; Mike, Dudela</p>
  `);
}

function confirmationEmailHtml(name: string, body: string) {
  const firstName = name ? name.split(" ")[0] : "there";
  return emailShell(`
    <p style="color:#1c2319;font-size:17px;line-height:1.6;margin:0 0 18px;">Hey ${firstName},</p>
    <p style="color:#1c2319;font-size:17px;line-height:1.6;margin:0 0 24px;">${body}</p>
    <p style="color:#1c2319;font-size:15px;margin:0;">— John &amp; Mike, Dudela</p>
  `);
}

function notifyEmailHtml(opts: { name: string; email: string; magnet: string; source: string }) {
  return `
    <div style="font-family: sans-serif; color: #1c2319; max-width: 480px;">
      <p><strong>New lead:</strong> ${opts.magnet}</p>
      <p>Name: ${opts.name || "(not given)"}<br/>
      Email: ${opts.email}<br/>
      Source: ${opts.source || "(unknown)"}</p>
    </div>
  `;
}

export async function POST({ request, locals }: APIContext) {
  const env = (locals as any).runtime.env;

  let body: Record<string, string>;
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    body = await request.json();
  } else {
    const form = await request.formData();
    body = Object.fromEntries(form.entries()) as Record<string, string>;
  }

  const email = (body.email || "").trim();
  const name = (body.name || "").trim();
  const magnet = (body.magnet || "guide").trim();
  const source = (body.source || "").trim();

  if (!email || !email.includes("@")) {
    return new Response(JSON.stringify({ ok: false, error: "A valid email is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const errors: string[] = [];

  try {
    const accessToken = await getGoogleAccessToken(env, [GOOGLE_SCOPES.sheets]);
    await appendSheetRow(accessToken, env.GOOGLE_SHEET_ID, "Leads!A:E", [
      new Date().toISOString(),
      name,
      email,
      magnet,
      source,
    ]);
  } catch (err) {
    console.error("Lead magnet sheet log failed:", err);
    errors.push("sheet");
  }

  try {
    await addMailerLiteSubscriber(env, { email, name, groupId: env.MAILERLITE_GROUP_ID });
  } catch (err) {
    console.error("Lead magnet MailerLite add failed:", err);
    errors.push("mailerlite");
  }

  // Submitter-facing email: real PDF delivery if we have one hosted for this magnet,
  // otherwise the generic "you're confirmed" copy so nobody is left wondering if their
  // submission actually went through.
  const magnetInfo = MAGNETS[magnet];
  try {
    if (magnetInfo) {
      await sendEmail(env, {
        to: email,
        subject: magnetInfo.subject,
        html: deliveryEmailHtml(name, magnetInfo),
      });
    } else {
      const confirmation = CONFIRMATIONS[magnet] || CONFIRMATIONS["newsletter"];
      await sendEmail(env, {
        to: email,
        subject: confirmation.subject,
        html: confirmationEmailHtml(name, confirmation.body),
      });
    }
  } catch (err) {
    console.error("Lead magnet confirmation email failed:", err);
    errors.push("confirmation-email");
  }

  // Internal notification so new leads don't require checking the Google Sheet manually.
  try {
    await sendEmail(env, {
      to: env.NOTIFY_EMAIL || "dude@thedudelaco.com",
      subject: `New ${magnet} signup — ${email}`,
      html: notifyEmailHtml({ name, email, magnet, source }),
      replyTo: email,
    });
  } catch (err) {
    console.error("Lead magnet internal notification failed:", err);
    errors.push("notify-email");
  }

  return new Response(JSON.stringify({ ok: true, warnings: errors }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
