import type { APIContext } from "astro";
import { isAdminAuthed } from "../../../lib/auth";
import { createPrintfulOrder, getShirtVariant, SHIRT_CATALOG } from "../../../lib/printful";
import { sendEmail } from "../../../lib/email";
import { PRODUCTS, receiptEmailHtml } from "../stripe-webhook";

export const prerender = false;

// Admin-only spot-check tool for the shirt pipeline — mirrors
// /api/admin/test-hat-order.ts exactly, same reasoning: exercises the real
// createPrintfulOrder call for any SHIRT_CATALOG variant without a real
// Stripe charge and — by default — without a real Printful production
// charge either.
//
// By default this creates the Printful order and stops (confirm=false) —
// Printful doesn't bill for a draft order, only a confirmed one, so you can
// open the result in the Printful dashboard (Orders), check the size/color
// print file is right, then delete the draft. Zero cost, repeat for all 14
// color/size combos as many times as needed.
//
// Pass &confirm=1 to actually confirm it into production for real (real
// Printful charge, same as a live purchase) — only for a genuine "hold the
// finished shirt in my hands" check.
//
// Usage (while logged in at /admin/login) — color is a SHIRT_CATALOG key,
// e.g. "shirt-dad-est-black-m" or "shirt-dad-est-ivory-xl":
//   /api/admin/test-shirt-order?color=shirt-dad-est-black-m
//   /api/admin/test-shirt-order?color=shirt-dad-est-ivory-xl&email=you@example.com
//   /api/admin/test-shirt-order?color=shirt-dad-est-black-l&confirm=1   (real charge)
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

  const shirt = getShirtVariant(color);
  if (!shirt) {
    return new Response(
      JSON.stringify({
        error: `Unknown color "${color}".`,
        validColors: SHIRT_CATALOG.map((s) => s.key),
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Real address on file — fine to reuse for a draft (never ships) and even
  // for a real confirm (goes to John, who can inspect the physical shirt).
  const recipient = {
    name: "John Mulhern",
    address1: "9737 Villosa St",
    city: "Littleton",
    state_code: "CO",
    country_code: "US",
    zip: "80125",
    email: testEmail,
  };

  const externalId = `admin-test-${shirt.key}-${Date.now()}`;

  let printfulResult;
  try {
    printfulResult = await createPrintfulOrder(env, {
      syncVariantId: shirt.syncVariantId,
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
  const productInfo = PRODUCTS[shirt.key];
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
        shirt: { key: shirt.key, design: shirt.designLabel, color: shirt.colorLabel, size: shirt.size },
        printful: printfulResult,
        confirmed: confirm,
        note: confirm
          ? "Confirmed into production — this was a REAL Printful charge, same as a live order."
          : "Left as an unconfirmed draft — free. Open Printful → Orders, find this order, check the size/color/print file, then delete it when done.",
        emailSentTo: emailSent ? testEmail : null,
        emailError,
      },
      null,
      2
    ),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
