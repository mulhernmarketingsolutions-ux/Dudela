import type { APIContext } from "astro";
import { getGoogleAccessToken, appendSheetRow, GOOGLE_SCOPES } from "../../lib/google";
import { sendLoopsEvent } from "../../lib/loops";
import { sendEmail } from "../../lib/email";

export const prerender = false;

// Handles the application form on /turn (The Turn — $1,800 6-week 1:1 onboarding,
// then custom/package-based ongoing support). Deliberately NOT a Stripe checkout button like the Prep
// Kit or Spit-Up Society: this is a screened, capped, high-touch offer (John + Mike
// personally take every client, capacity is genuinely limited), so the flow is
// apply → John/Mike review and reach out to book a call → enroll manually, not
// buy-now-instant-access. Mirrors lead-magnet.ts's plumbing (Sheet log, Loops
// event, confirmation email, internal notify) but with its own tab/event/copy
// since this is a fundamentally different kind of lead than a free-guide signup.
//
// Required Cloudflare secrets: same as lead-magnet.ts — GOOGLE_SERVICE_ACCOUNT_EMAIL,
// GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, GOOGLE_SHEET_ID, LOOPS_API_KEY, RESEND_API_KEY,
// RESEND_FROM_EMAIL, NOTIFY_EMAIL (optional — defaults to dude@thedudelaco.com).
//
// One-time manual setup needed before this goes live: add a "Turn Applications" tab
// to the same Google Sheet the "Leads" tab lives in, with a header row matching the
// columns appended below (Timestamp, Name, Email, Phone, Kid's stage, What's going
// on, Source). Sheets' append API writes into an existing tab — it won't create one.

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
            The Dudela Co. &middot; The Turn &middot;
            <a href="https://thedudelaco.com" style="color:#8a9280;">thedudelaco.com</a>
          </p>
        </div>
      </div>
    </div>
  `;
}

function applicantConfirmationHtml(name: string) {
  const firstName = name ? name.split(" ")[0] : "there";
  return emailShell(`
    <p style="color:#1c2319;font-size:17px;line-height:1.6;margin:0 0 18px;">Hey ${firstName},</p>
    <p style="color:#1c2319;font-size:17px;line-height:1.6;margin:0 0 18px;">
      Got your application for <strong>The Turn</strong>. This isn't an automated funnel — John or Mike
      personally reads every one of these.
    </p>
    <p style="color:#1c2319;font-size:17px;line-height:1.6;margin:0 0 18px;">
      We keep this small on purpose, so expect a real reply from one of us within a couple of days to
      set up a call and see if it's a fit — not an instant checkout link.
    </p>
    <p style="color:#1c2319;font-size:15px;margin:26px 0 0;">— John &amp; Mike, Dudela</p>
  `);
}

function notifyEmailHtml(opts: {
  name: string;
  email: string;
  phone: string;
  stage: string;
  context: string;
  source: string;
}) {
  return `
    <div style="font-family: sans-serif; color: #1c2319; max-width: 560px;">
      <p style="font-size:16px;"><strong>New Turn application — ${opts.name || "(no name)"}</strong></p>
      <p>
        Email: ${opts.email}<br/>
        Phone: ${opts.phone || "(not given)"}<br/>
        Kid's stage: ${opts.stage || "(not given)"}<br/>
        Source: ${opts.source || "(unknown)"}
      </p>
      <p><strong>What's going on:</strong><br/>${(opts.context || "(not given)").replace(/\n/g, "<br/>")}</p>
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

  const name = (body.name || "").trim();
  const email = (body.email || "").trim();
  const phone = (body.phone || "").trim();
  const stage = (body.stage || "").trim();
  const context = (body.context || "").trim();
  const source = (body.source || "/turn").trim();

  if (!email || !email.includes("@")) {
    return new Response(JSON.stringify({ ok: false, error: "A valid email is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!name) {
    return new Response(JSON.stringify({ ok: false, error: "Name is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const errors: string[] = [];

  try {
    const accessToken = await getGoogleAccessToken(env, [GOOGLE_SCOPES.sheets]);
    await appendSheetRow(accessToken, env.GOOGLE_SHEET_ID, "Turn Applications!A:G", [
      new Date().toISOString(),
      name,
      email,
      phone,
      stage,
      context,
      source,
    ]);
  } catch (err) {
    console.error("Turn application sheet log failed:", err);
    errors.push("sheet");
  }

  try {
    await sendLoopsEvent(env, { email, name, magnet: "turn-application", source });
  } catch (err) {
    console.error("Turn application Loops event failed:", err);
    errors.push("loops");
  }

  try {
    await sendEmail(env, {
      to: email,
      subject: "Got your application for The Turn",
      html: applicantConfirmationHtml(name),
    });
  } catch (err) {
    console.error("Turn application confirmation email failed:", err);
    errors.push("confirmation-email");
  }

  // This one matters more than the equivalent lead-magnet.ts notify — a Turn
  // application is a high-ticket lead, not a free-guide signup, so it's worth
  // treating the subject line as genuinely urgent rather than routine.
  try {
    await sendEmail(env, {
      to: env.NOTIFY_EMAIL || "dude@thedudelaco.com",
      subject: `🔥 New Turn application — ${name} (${email})`,
      html: notifyEmailHtml({ name, email, phone, stage, context, source }),
      replyTo: email,
    });
  } catch (err) {
    console.error("Turn application internal notification failed:", err);
    errors.push("notify-email");
  }

  return new Response(JSON.stringify({ ok: true, warnings: errors }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
