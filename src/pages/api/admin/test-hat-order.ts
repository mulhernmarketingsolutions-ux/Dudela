import type { APIContext } from "astro";
import { isAdminAuthed } from "../../../lib/auth";
import { createPrintfulOrder, getHatVariant, HAT_CATALOG, shortExternalId } from "../../../lib/printful";
import { sendEmail } from "../../../lib/email";
import { PRODUCTS, receiptEmailHtml } from "../stripe-webhook";

export const prerender = false;

// Admin-only spot-check tool for the hat pipeline — exercises the exact same
// code the real Stripe webhook calls (buildPlacements, findVariantId,
// createPrintfulOrder, the real receipt email HTML) for any of the 12
// HAT_CATALOG colors, without a real Stripe charge and — by default —
// without a real Printful production charge either.
//
// By default this creates the Printful order and stops (confirm=false, see
// the comment on createPrintfulOrder in lib/printful.ts) — Printful doesn't
// bill for a draft order, only a confirmed one, so you can open the result
// in the Printful dashboard (Orders), check the mockup/print files/thread
// colors are right for that color, then delete the draft. Zero cost, repeat
// for all 12 colors as many times as needed.
//
// Pass &confirm=1 to actually confirm it into production for real (real
// Printful charge, same as a live purchase) — only do that for a genuine
// "I want to hold the finished hat in my hands" check, not routine testing.
//
// Usage (while logged in at /admin/login) — color is a HAT_CATALOG key,
// e.g. "classic-white-noaddon-black" or "rookie-orange-withaddon-white":
//   /api/admin/test-hat-order?color=classic-white-noaddon-black
//   /api/admin/test-hat-order?color=rookie-orange-withaddon-white&email=you@example.com
//   /api/admin/test-hat-order?color=classic-black-withaddon-white&confirm=1   (real charge)
export async function GET({ request, locals, cookies }: APIContext) {
  const env = (locals as any).runtime.env;

  const authed = await isAdminAuthed(cookies, env);
  if (!authed) {
    return new Response(JSON.stringify({ error: "Not logged in. Visit /admin/login first." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(request.url);
  const color = url.searchParams.get("color") || "";
  const confirm = url.searchParams.get("confirm") === "1";
  const testEmail = url.searchParams.get("email") || env.NOTIFY_EMAIL || "dude@thedudelaco.com";

  const hat = getHatVariant(color);
  if (!hat) {
    return new Response(
      JSON.stringify({
        error: `Unknown color "${color}".`,
        validColors: HAT_CATALOG.map((h) => h.key),
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Real address on file — fine to reuse for a draft (never ships) and even
  // for a real confirm (goes to John, who can inspect the physical hat).
  const recipient = {
    name: "John Mulhern",
    address1: "9737 Villosa St",
    city: "Littleton",
    state_code: "CO",
    country_code: "US",
    zip: "80125",
    email: testEmail,
  };

  const externalId = await shortExternalId(`admin-test-${hat.key}-${Date.now()}`);

  let printfulResult;
  try {
    printfulResult = await createPrintfulOrder(env, {
      syncVariantId: hat.syncVariantId,
      recipient,
      externalId,
      confirm,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: `Printful order failed: ${message}` }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let emailSent = false;
  let emailError: string | null = null;
  const productInfo = PRODUCTS[hat.key];
  if (productInfo) {
    try {
      await sendEmail(env, {
        to: testEmail,
        subject: `[TEST] You're in — ${productInfo.name} receipt`,
        html: receiptEmailHtml("Test", productInfo),
      });
      emailSent = true;
    } catch (err) {
      emailError = err instanceof Error ? err.message : String(err);
    }
  }

  return new Response(
    JSON.stringify(
      {
        ok: true,
        hat: { key: hat.key, design: hat.designLabel, thread: hat.threadLabel, addon: hat.addon, printfulColor: hat.printfulColor },
        printful: printfulResult,
        confirmed: confirm,
        note: confirm
          ? "Confirmed into production — this was a REAL Printful charge, same as a live order."
          : "Left as an unconfirmed draft — free. Open Printful → Orders, find this order, check the mockup/thread colors, then delete it when done.",
        emailSentTo: emailSent ? testEmail : null,
        emailError,
      },
      null,
      2
    ),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
