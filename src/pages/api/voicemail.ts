import type { APIContext } from "astro";
import { getGoogleAccessToken, uploadToDrive, appendSheetRow, GOOGLE_SCOPES } from "../../lib/google";
import { sendEmail } from "../../lib/email";

export const prerender = false;

// Handles the "Leave a Voicemail" recorder.
// 1. Uploads the audio into a shared Drive folder, named so it sorts cleanly by date.
// 2. Logs it to the "Voicemails" tab of the shared Sheet.
// 3. Emails John & Mike a notification with the Drive link.
// 4. Emails the visitor a confirmation (email is required, so this always goes out).
//
// Required Cloudflare secrets: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
// GOOGLE_DRIVE_VOICEMAIL_FOLDER_ID, GOOGLE_SHEET_ID, RESEND_API_KEY, RESEND_FROM_EMAIL, NOTIFY_EMAILS
// (comma-separated, e.g. "john@thedudelaco.com,mike@thedudelaco.com").

function sanitizeForFilename(input: string): string {
  return input.replace(/[^a-zA-Z0-9-_]/g, "").slice(0, 40) || "anonymous";
}

export async function POST({ request, locals }: APIContext) {
  const env = (locals as any).runtime.env;

  const form = await request.formData();
  const name = ((form.get("name") as string) || "").trim();
  const email = ((form.get("email") as string) || "").trim();
  const audio = form.get("audio") as File | null;

  if (!email || !email.includes("@")) {
    return new Response(JSON.stringify({ ok: false, error: "An email is required so we can confirm we got it." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!audio) {
    return new Response(JSON.stringify({ ok: false, error: "No audio was received." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 16); // 2026-07-20T14-32
  const filename = `${stamp}_${sanitizeForFilename(name || "anonymous")}.mp3`;

  const bytes = await audio.arrayBuffer();

  let driveLink = "";
  try {
    const accessToken = await getGoogleAccessToken(env, [GOOGLE_SCOPES.drive, GOOGLE_SCOPES.sheets]);

    const uploaded = await uploadToDrive(accessToken, env.GOOGLE_DRIVE_VOICEMAIL_FOLDER_ID, filename, "audio/mpeg", bytes);
    driveLink = uploaded.webViewLink;

    await appendSheetRow(accessToken, env.GOOGLE_SHEET_ID, "Voicemails!A:D", [now.toISOString(), name, email, driveLink]);
  } catch (err) {
    console.error("Voicemail Drive/Sheets step failed:", err);
    return new Response(JSON.stringify({ ok: false, error: "Something went wrong saving your voicemail. Please try again." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const notifyList = (env.NOTIFY_EMAILS || "").split(",").map((s: string) => s.trim()).filter(Boolean);
    if (notifyList.length) {
      await sendEmail(env, {
        to: notifyList,
        subject: `New Dudela voicemail from ${name || "a dad"}`,
        html: `<p><strong>${name || "Someone"}</strong> (${email}) left a voicemail.</p><p><a href="${driveLink}">Listen on Drive</a></p>`,
      });
    }
  } catch (err) {
    console.error("Voicemail notify email failed:", err);
  }

  try {
    await sendEmail(env, {
      to: email,
      subject: "We got your voicemail",
      html: `
        <p>Hey${name ? " " + name : ""},</p>
        <p>Dudela got your voicemail. John and Mike will be listening to it soon.</p>
        <p>Whatever you're carrying right now, showing up to say it out loud already puts you ahead of most dads. That takes something.</p>
        <p>While you wait, catch up on <a href="https://www.thedudelaco.com/podcast">the podcast</a> — there's a good chance an episode already covers exactly what's on your mind.</p>
        <p>— The Dudela Team</p>
      `,
    });
  } catch (err) {
    console.error("Voicemail confirmation email failed:", err);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
