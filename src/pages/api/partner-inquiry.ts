import type { APIContext } from "astro";
import { getGoogleAccessToken, appendSheetRow, GOOGLE_SCOPES } from "../../lib/google";
import { sendLoopsEvent } from "../../lib/loops";
import { sendEmail } from "../../lib/email";

export const prerender = false;

// Handles the sponsorship/partnership inquiry form on /partners. Deliberately
// its own endpoint, not routed through lead-magnet.ts, even though the
// plumbing (Sheet log, Loops event, confirmation email, internal notify)
// mirrors it and turn-application.ts closely. A brand asking about a
// newsletter or podcast placement is a fundamentally different kind of
// contact than a dad signing up for free content, and John was explicit
// that sponsor inquiries need to stay separate from consumer newsletter
// subscriptions rather than sharing a list or a tag.
//
// Required Cloudflare secrets: same as lead-magnet.ts/turn-application.ts —
// GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
// GOOGLE_SHEET_ID, LOOPS_API_KEY, RESEND_API_KEY, RESEND_FROM_EMAIL,
// NOTIFY_EMAIL (optional, defaults to dude@thedudelaco.com).
//
// NOTE: unlike "Leads" and "Turn Applications", there is no confirmed
// "Partner Inquiries" tab in the shared Google Sheet yet — the Sheets append
// API can't create one. This call is wrapped in try/catch like the other
// sheet writes here, so a missing tab degrades to "no sheet row" rather than
// breaking the submission; the Loops event and both emails still fire either
// way. Add a "Partner Inquiries" tab with header row (Timestamp, Name,
// Email, Company, Website, Placement/Idea, Timing, Budget, Source) to get
// the sheet log working too.

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
            The Dudela Co. &middot; Partnerships &middot;
            <a href="https://thedudelaco.com" style="color:#8a9280;">thedudelaco.com</a>
          </p>
        </div>
      </div>
    </div>
  `;
}

function inquirerConfirmationHtml(name: string) {
  const firstName = name ? name.split(" ")[0] : "there";
  return emailShell(`
    <p style="color:#1c2319;font-size:17px;line-height:1.6;margin:0 0 18px;">Hey ${firstName},</p>
    <p style="color:#1c2319;font-size:17px;line-height:1.6;margin:0 0 18px;">
      Thanks for reaching out about partnering with Dudela. John or Mike personally reads every
      one of these, not a sales team, so it may take a couple of days to get back to you.
    </p>
    <p style="color:#1c2319;font-size:17px;line-height:1.6;margin:0 0 18px;">
      We'll reply with next steps, or a straight "not a fit right now" if that's the honest
      answer.
    </p>
    <p style="color:#1c2319;font-size:15px;margin:26px 0 0;">— John &amp; Mike, Dudela</p>
  `);
}

function notifyEmailHtml(opts: {
  name: string;
  email: string;
  company: string;
  website: string;
  placement: string;
  timing: string;
  budget: string;
  source: string;
}) {
  return `
    <div style="font-family: sans-serif; color: #1c2319; max-width: 560px;">
      <p style="font-size:16px;"><strong>New partner inquiry — ${opts.company || opts.name || "(no company given)"}</strong></p>
      <p>
        Name: ${opts.name || "(not given)"}<br/>
        Email: ${opts.email}<br/>
        Company: ${opts.company || "(not given)"}<br/>
        Website: ${opts.website || "(not given)"}<br/>
        Timing: ${opts.timing || "(not given)"}<br/>
        Budget range: ${opts.budget || "(not given)"}<br/>
        Source: ${opts.source || "(unknown)"}
      </p>
      <p><strong>Placement or idea:</strong><br/>${(opts.placement || "(not given)").replace(/\n/g, "<br/>")}</p>
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
  const company = (body.company || "").trim();
  const website = (body.website || "").trim();
  const placement = (body.placement || "").trim();
  const timing = (body.timing || "").trim();
  const budget = (body.budget || "").trim();
  const source = (body.source || "/partners").trim();

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
    await appendSheetRow(accessToken, env.GOOGLE_SHEET_ID, "Partner Inquiries!A:H", [
      new Date().toISOString(),
      name,
      email,
      company,
      website,
      placement,
      timing,
      budget,
    ]);
  } catch (err) {
    // Expected until the "Partner Inquiries" tab exists in the sheet — see
    // the file-level note above. Logged, not fatal: the event + both emails
    // below still fire.
    console.error("Partner inquiry sheet log failed:", err);
    errors.push("sheet");
  }

  try {
    const result = await sendLoopsEvent(env, { email, name, magnet: "partner-inquiry", source });
    if (!result) errors.push("loops");
  } catch (err) {
    console.error("Partner inquiry Loops event failed:", err);
    errors.push("loops");
  }

  try {
    await sendEmail(env, {
      to: email,
      subject: "Got your partnership inquiry",
      html: inquirerConfirmationHtml(name),
    });
  } catch (err) {
    console.error("Partner inquiry confirmation email failed:", err);
    errors.push("confirmation-email");
  }

  try {
    await sendEmail(env, {
      to: env.NOTIFY_EMAIL || "dude@thedudelaco.com",
      subject: `New partner inquiry — ${company || name} (${email})`,
      html: notifyEmailHtml({ name, email, company, website, placement, timing, budget, source }),
      replyTo: email,
    });
  } catch (err) {
    console.error("Partner inquiry internal notification failed:", err);
    errors.push("notify-email");
  }

  return new Response(JSON.stringify({ ok: true, warnings: errors }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
