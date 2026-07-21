import type { APIContext } from "astro";
import { getGoogleAccessToken, appendSheetRow, GOOGLE_SCOPES } from "../../lib/google";
import { addMailerLiteSubscriber } from "../../lib/mailerlite";

export const prerender = false;

// Handles every lead-magnet form on the site (free guide, checklists, etc).
// 1. Logs the submission to the "Leads" tab of the shared Google Sheet.
// 2. Adds the person to MailerLite so the existing nurture sequence keeps doing its job.
//
// Required Cloudflare secrets: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
// GOOGLE_SHEET_ID, MAILERLITE_API_KEY, MAILERLITE_GROUP_ID (optional).

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

  return new Response(JSON.stringify({ ok: true, warnings: errors }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
