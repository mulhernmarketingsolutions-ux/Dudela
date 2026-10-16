// Meta Conversions API: sends the Purchase event from the server the moment
// Stripe confirms payment, so it counts even when the buyer's browser blocks
// the pixel (Safari, Brave, ad blockers). The browser pixel on the thank-you
// page sends the same event with eventID = Stripe session id; Meta dedupes the
// pair on event_name + event_id, so a sale is never counted twice.
// Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
//
// Needs the META_CAPI_TOKEN secret (Events Manager -> Dudela Website ->
// Settings -> Conversions API -> Generate access token). With no token set
// this is a silent no-op.

export const META_PIXEL_ID = "1645170497121257";
const GRAPH_VERSION = "v21.0";

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.trim().toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sendMetaPurchase(
  env: { META_CAPI_TOKEN?: string; META_TEST_EVENT_CODE?: string },
  opts: {
    eventId: string;
    email?: string;
    name?: string;
    value: number;
    currency?: string;
    product: string;
    fbp?: string;
    fbc?: string;
    ip?: string;
    userAgent?: string;
    sourceUrl?: string;
  },
): Promise<void> {
  if (!env.META_CAPI_TOKEN) return;

  const user_data: Record<string, unknown> = {};
  if (opts.email) user_data.em = [await sha256(opts.email)];
  const parts = (opts.name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length) user_data.fn = [await sha256(parts[0])];
  if (parts.length > 1) user_data.ln = [await sha256(parts[parts.length - 1])];
  if (opts.fbp) user_data.fbp = opts.fbp;
  if (opts.fbc) user_data.fbc = opts.fbc;
  if (opts.ip) user_data.client_ip_address = opts.ip;
  if (opts.userAgent) user_data.client_user_agent = opts.userAgent;
  user_data.country = [await sha256("us")];

  const body: Record<string, unknown> = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: opts.eventId,
        action_source: "website",
        event_source_url: opts.sourceUrl || "https://thedudelaco.com/",
        user_data,
        custom_data: {
          value: opts.value,
          currency: (opts.currency || "usd").toUpperCase(),
          content_name: opts.product,
        },
      },
    ],
  };
  if (env.META_TEST_EVENT_CODE) body.test_event_code = env.META_TEST_EVENT_CODE;

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${META_PIXEL_ID}/events?access_token=${encodeURIComponent(env.META_CAPI_TOKEN)}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
  if (!res.ok) {
    throw new Error(`Meta CAPI ${res.status}: ${await res.text()}`);
  }
}
