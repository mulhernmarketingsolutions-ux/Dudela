// Adds/updates a subscriber in MailerLite and drops them in a group.
// Docs: https://developers.mailerlite.com/docs/subscribers.html

export interface MailerLiteEnv {
  MAILERLITE_API_KEY: string;
}

export async function addMailerLiteSubscriber(
  env: MailerLiteEnv,
  opts: { email: string; name?: string; groupId?: string }
) {
  const res = await fetch("https://connect.mailerlite.com/api/subscribers", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.MAILERLITE_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      email: opts.email,
      fields: opts.name ? { name: opts.name } : undefined,
      groups: opts.groupId ? [opts.groupId] : undefined,
    }),
  });

  if (!res.ok) {
    // Don't let a MailerLite hiccup break the whole request — log and move on.
    console.error(`MailerLite add failed: ${res.status} ${await res.text()}`);
    return null;
  }
  return res.json();
}
