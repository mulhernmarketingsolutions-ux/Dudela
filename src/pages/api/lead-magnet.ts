import type { APIContext } from "astro";
import { getGoogleAccessToken, appendSheetRow, GOOGLE_SCOPES } from "../../lib/google";
import { addMailerLiteSubscriber } from "../../lib/mailerlite";
import { sendEmail } from "../../lib/email";

export const prerender = false;

// Handles every lead-magnet form on the site (free guide, checklists, etc).
// 1. Logs the submission to the "Leads" tab of the shared Google Sheet.
// 2. Adds the person to MailerLite so the existing nurture sequence keeps doing its job.
// 3. Sends an immediate email (via Resend) with the download link for that specific
//    magnet — the "instant PDF delivery" piece, same idea as the Gmail auto-send used
//    on the other sites, just via Resend since it's already wired up for the voicemail
//    feature and doesn't need Gmail OAuth.
//
// Required Cloudflare secrets: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
// GOOGLE_SHEET_ID, MAILERLITE_API_KEY, MAILERLITE_GROUP_ID (optional), RESEND_API_KEY,
// RESEND_FROM_EMAIL.
//
// MAGNETS below maps each `magnet` value (sent by the form) to its subject line and the
// PDF's public URL. Drop real PDF files in /public/downloads/ and update the url — until
// then this map is empty-safe: if a magnet isn't listed, no delivery email is sent (sheet
// + MailerLite logging still happens normally).
const MAGNETS: Record<string, { subject: string; fileName: string; url: string }> = {
  // "free-guide": {
  //   subject: "Your free guide — 15 Things Every Dad Should Do Before the Baby Arrives",
  //   fileName: "Dudela – Free Dad Prep Guide.pdf",
  //   url: "https://thedudelaco.com/downloads/free-dad-prep-guide.pdf",
  // },
};

function deliveryEmailHtml(name: string, magnetInfo: { fileName: string; url: string }) {
  const firstName = name ? name.split(" ")[0] : "there";
  return `
    <div style="font-family: sans-serif; color: #1c2319; max-width: 480px;">
      <p>Hey ${firstName},</p>
      <p>Here's your download, straight from us — no fluff, just the guide.</p>
      <p><a href="${magnetInfo.url}" style="display:inline-block;background:#e27d25;color:#1c2319;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:700;">Download ${magnetInfo.fileName}</a></p>
      <p>— John &amp; Mike, Dudela</p>
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

  const magnetInfo = MAGNETS[magnet];
  if (magnetInfo) {
    try {
      await sendEmail(env, {
        to: email,
        subject: magnetInfo.subject,
        html: deliveryEmailHtml(name, magnetInfo),
      });
    } catch (err) {
      console.error("Lead magnet delivery email failed:", err);
      errors.push("delivery-email");
    }
  }

  return new Response(JSON.stringify({ ok: true, warnings: errors }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
