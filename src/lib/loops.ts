// Adds/updates a contact in Loops and fires an event to trigger the matching
// workflow (e.g. the welcome/nurture sequence, or a future Spit-Up Society flow).
// Docs: https://loops.so/docs/api-reference/send-event
//
// Using the "send event" endpoint instead of "create contact" on purpose: it
// upserts cleanly (a contact who signs up for the newsletter and later the
// free guide won't hit a 409 conflict), and the event itself is what triggers
// automations inside Loops — build one workflow per eventName below in the
// Loops dashboard (Workflows → New → "Event" trigger).

export interface LoopsEnv {
  LOOPS_API_KEY: string;
}

// Maps each site `magnet` value to a Loops event name + segment (userGroup).
// Keep this in sync with the tags in "Dudela Email System & Welcome Sequence.md".
export const LOOPS_EVENTS: Record<string, { eventName: string; userGroup: string }> = {
  "free-guide": { eventName: "lead-free-guide", userGroup: "Lead – Free Guide" },
  "newsletter": { eventName: "lead-newsletter", userGroup: "Lead – Newsletter" },
  "hat-waitlist": { eventName: "lead-hat-waitlist", userGroup: "Lead – Hat Waitlist" },
  "fall-cohort-waitlist": { eventName: "lead-fall-cohort", userGroup: "Lead – Fall Cohort" },
};

// Maps each Stripe `product` value (see create-checkout-session.ts) to the Loops event
// fired on successful purchase/subscription. One workflow per eventName in Loops,
// triggered off a Stripe webhook instead of a site form. userGroup here doubles as the
// permanent "customer_/member_" style tag referenced in the email ecosystem architecture
// doc — it's what future Ongoing Newsletter sends filter on to suppress repeat pitches.
export const PURCHASE_EVENTS: Record<string, { eventName: string; userGroup: string }> = {
  "prep-kit": { eventName: "purchase-prep-kit", userGroup: "Customer – Prep Kit" },
};

async function sendEvent(
  env: LoopsEnv,
  opts: { email: string; firstName?: string; eventName: string; userGroup: string; source?: string }
) {
  const res = await fetch("https://app.loops.so/api/v1/events/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.LOOPS_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: opts.email,
      firstName: opts.firstName,
      eventName: opts.eventName,
      userGroup: opts.userGroup,
      source: opts.source || "website",
    }),
  });

  if (!res.ok) {
    // Don't let a Loops hiccup break the whole request — log and move on.
    console.error(`Loops event failed: ${res.status} ${await res.text()}`);
    return null;
  }
  return res.json();
}

export async function sendLoopsEvent(
  env: LoopsEnv,
  opts: { email: string; name?: string; magnet: string; source?: string }
) {
  const mapping = LOOPS_EVENTS[opts.magnet] || LOOPS_EVENTS["newsletter"];
  const firstName = opts.name ? opts.name.split(" ")[0] : undefined;
  return sendEvent(env, {
    email: opts.email,
    firstName,
    eventName: mapping.eventName,
    userGroup: mapping.userGroup,
    source: opts.source,
  });
}

// Fired from the Stripe webhook handler on checkout.session.completed /
// customer.subscription.created — tags the buyer as a customer/member in Loops so the
// Post-Purchase Onboarding sequence (or Membership Welcome sequence) kicks in, and so
// they're permanently excluded from top-of-funnel pitches for the same product.
export async function sendLoopsPurchaseEvent(
  env: LoopsEnv,
  opts: { email: string; name?: string; product: string; source?: string }
) {
  const mapping = PURCHASE_EVENTS[opts.product];
  if (!mapping) {
    console.error(`No Loops purchase mapping for product "${opts.product}"`);
    return null;
  }
  const firstName = opts.name ? opts.name.split(" ")[0] : undefined;
  return sendEvent(env, {
    email: opts.email,
    firstName,
    eventName: mapping.eventName,
    userGroup: mapping.userGroup,
    source: opts.source || "stripe",
  });
}
