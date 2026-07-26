import type { APIContext } from "astro";
import { createPortalSession } from "../../lib/stripe";
import { getAuthedMember } from "../../lib/auth";

export const prerender = false;

// "Manage membership" button on the gated dashboard — sends the member to
// Stripe's hosted Billing Portal (update card, view invoices, cancel) so we
// don't have to build any of that ourselves. Requires the member to have a
// stripe_customer_id on file, which the webhook sets on checkout completion.
export async function GET({ request, locals, cookies }: APIContext) {
  const env = (locals as any).runtime.env;
  const url = new URL(request.url);

  const member = await getAuthedMember(cookies, env);
  if (!member) {
    return Response.redirect(`${url.origin}/member/login`, 302);
  }
  if (!member.stripe_customer_id) {
    return Response.redirect(`${url.origin}/member/dashboard?error=no-billing-account`, 302);
  }

  try {
    const session = await createPortalSession(env, {
      customerId: member.stripe_customer_id,
      returnUrl: `${url.origin}/member/dashboard`,
    });
    return Response.redirect(session.url, 302);
  } catch (err) {
    console.error("Stripe portal session failed:", err);
    return Response.redirect(`${url.origin}/member/dashboard?error=portal`, 302);
  }
}
