import type { APIContext } from "astro";

export const prerender = false;

// One-click stop for the weekly due-date emails. Clears the member's due
// date, which takes them out of the daily send. Membership is untouched.
export async function GET({ url, locals }: APIContext) {
  const env = (locals as any).runtime.env;
  const id = url.searchParams.get("m") || "";
  if (id) {
    try {
      await env.DB.prepare("UPDATE members SET due_date = NULL WHERE id = ?").bind(id).run();
    } catch (err) {
      console.error("due-date-stop failed:", err);
    }
  }
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Stopped</title>
<body style="font-family:Arial,sans-serif;background:#f5efe3;color:#1c2319;display:flex;min-height:90vh;align-items:center;justify-content:center;text-align:center;padding:24px">
<div><h1 style="font-size:24px">Done. No more weekly due-date emails.</h1><p>You're still in the Spit-Up Society. <a href="https://thedudelaco.com/member/dashboard">Back to the member area</a></p></div></body>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
