// Thin wrapper around Resend's API (https://resend.com). Swap providers here if needed later.

export interface EmailEnv {
  RESEND_API_KEY: string;
  RESEND_FROM_EMAIL: string; // e.g. "Dudela <hello@thedudelaco.com>" — must be a verified sender in Resend
}

export async function sendEmail(
  env: EmailEnv,
  opts: { to: string | string[]; subject: string; html: string; replyTo?: string }
) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: Array.isArray(opts.to) ? opts.to : [opts.to],
      subject: opts.subject,
      html: opts.html,
      reply_to: opts.replyTo,
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}
