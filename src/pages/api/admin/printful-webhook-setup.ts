import type { APIContext } from "astro";
import { isAdminAuthed } from "../../../lib/auth";

export const prerender = false;

// One-time (or re-run-anytime) admin action to register Dudela's site as
// Printful's webhook receiver for package_shipped events — needed so
// /api/printful-webhook.ts actually gets called when an order ships.
// Printful only allows ONE active webhook URL per store (confirmed in their
// docs — calling this replaces whatever's currently configured), so this is
// safe to hit again any time the URL or token changes, but shouldn't be run
// against a store that has some other webhook integration already relying
// on a different URL.
//
// Requires PRINTFUL_WEBHOOK_TOKEN to already be set (wrangler secret put
// PRINTFUL_WEBHOOK_TOKEN — any random string) so the registered URL includes
// the matching ?token= the receiver checks.
//
// Usage (while logged in at /admin/login): visit
//   /api/admin/printful-webhook-setup
export async function GET({ locals, cookies, url }: APIContext) {
  const env = (locals as any).runtime.env;

  const authed = await isAdminAuthed(cookies, env);
  if (!authed) {
    return new Response(JSON.stringify({ error: "Not logged in. Visit /admin/login first." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!env.PRINTFUL_WEBHOOK_TOKEN) {
    return new Response(
      JSON.stringify({ error: "PRINTFUL_WEBHOOK_TOKEN secret is not set. Run: wrangler secret put PRINTFUL_WEBHOOK_TOKEN" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const webhookUrl = `${url.origin}/api/printful-webhook?token=${env.PRINTFUL_WEBHOOK_TOKEN}`;

  const res = await fetch("https://api.printful.com/webhooks", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.PRINTFUL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: webhookUrl,
      types: ["package_shipped"],
    }),
  });

  const text = await res.text();
  return new Response(
    JSON.stringify(
      {
        ok: res.ok,
        registeredUrl: webhookUrl,
        printfulResponse: (() => {
          try {
            return JSON.parse(text);
          } catch {
            return text;
          }
        })(),
      },
      null,
      2
    ),
    { status: res.ok ? 200 : 500, headers: { "Content-Type": "application/json" } }
  );
}
