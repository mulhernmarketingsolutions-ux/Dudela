// Adds/updates a contact in Loops and fires an event to trigger the matching
// workflow (e.g. the welcome/nurture sequence, or a future Spit-Up Society flow).
// Docs: https://loops.so/docs/api-reference/send-event
//
// Using the "send event" endpoint instead of "create contact" on purpose: it
// upserts cleanly (a contact who signs up for the newsletter and later the
// free guide won't hit a 409 conflict), and the event itself is what triggers
// automations inside Loops — build one workflow per eventName below in the
// Loops dashboard (Workflows → New → "Event" trigger).

import { HAT_CATALOG } from "./printful";

export interface LoopsEnv {
  LOOPS_API_KEY: string;
}

// Maps each site `magnet` value to a Loops event name + segment (userGroup).
// Keep this in sync with the tags in "Dudela Email System & Welcome Sequence.md".
export const LOOPS_EVENTS: Record<string, { eventName: string; userGroup: string }> = {
  "free-guide": { eventName: "lead-free-guide", userGroup: "Lead – Free Guide" },
  "newsletter": { eventName: "lead-newsletter", userGroup: "Lead – Newsletter" },
  "fall-cohort-waitlist": { eventName: "lead-fall-cohort", userGroup: "Lead – Fall Cohort" },
  // "hat-waitlist" removed — merch.astro no longer has a waitlist form (real
  // buy buttons + Stripe checkout replaced it), so nothing posts this magnet
  // value anymore. Hat purchases are tracked via PURCHASE_EVENTS below instead.
};

// Maps each Stripe `product` value (see create-checkout-session.ts) to the Loops event
// fired on successful purchase/subscription. One workflow per eventName in Loops,
// triggered off a Stripe webhook instead of a site form. userGroup here doubles as the
// permanent "customer_/member_" style tag referenced in the email ecosystem architecture
// doc — it's what future Ongoing Newsletter sends filter on to suppress repeat pitches.
export const PURCHASE_EVENTS: Record<string, { eventName: string; userGroup: string }> = {
  "prep-kit": { eventName: "purchase-prep-kit", userGroup: "Customer – Prep Kit" },
  "spit-up-society": { eventName: "member-spit-up-society", userGroup: "Member – Spit-Up Society" },
  // Added when the merch presale shipped — these were missing from this
  // map at launch, which meant hat buyers were silently never tagged in Loops
  // at all (sendLoopsPurchaseEvent logs an error and no-ops on an unmapped
  // product; the purchase itself, receipt email, and D1 order row all still
  // worked fine, so this went unnoticed). One shared "Customer – Hat" group
  // rather than one per colorway — for email segmentation, "bought a hat" is
  // the useful distinction, not which color. Generated from HAT_CATALOG
  // (lib/printful.ts) instead of hand-typed — the old hardcoded list here
  // used the previous hat-fistbump-*/hat-upsidedown-* slugs, which stopped
  // matching anything the moment the catalog was rebuilt around real
  // Printful sync products (2026-08-13) — same silent-no-op failure mode
  // this comment already warns about, just from a different cause.
  ...Object.fromEntries(
    HAT_CATALOG.map((hat) => [hat.key, { eventName: "purchase-hat", userGroup: "Customer – Hat" }])
  ),
};

// Fired on customer.subscription.deleted — separate from PURCHASE_EVENTS since it's a
// cancellation, not a purchase, but keyed the same way by `product` for consistency.
export const CANCELLATION_EVENTS: Record<string, { eventName: string; userGroup: string }> = {
  "spit-up-society": {
    eventName: "member-spit-up-society-lapsed",
    userGroup: "Lapsed Member – Spit-Up Society",
  },
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

// Fired from the Stripe webhook handler on customer.subscription.deleted — tags a member
// as lapsed so future Ongoing Newsletter sends can offer a win-back instead of pretending
// they're still an active member.
export async function sendLoopsCancellationEvent(
  env: LoopsEnv,
  opts: { email: string; name?: string; product: string; source?: string }
) {
  const mapping = CANCELLATION_EVENTS[opts.product];
  if (!mapping) {
    console.error(`No Loops cancellation mapping for product "${opts.product}"`);
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

// Fired once per active member when John/Mike publish something in the gated
// member area (new Womb Watch post today; same event covers future post
// categories too). NOTE: these eventNames don't have a matching Loops
// Workflow yet — build one per event in the Loops dashboard (Workflows →
// New → "Event" trigger) the same way the onboarding sequences were built,
// otherwise this call is a no-op from the member's perspective even though
// the API call itself succeeds.
export const MEMBER_NOTIFICATION_EVENTS: Record<string, { eventName: string }> = {
  "womb-watch": { eventName: "womb-watch-new-post" },
  "merch-drop": { eventName: "member-merch-drop" },
};

export async function sendMemberNotificationEvent(
  env: LoopsEnv,
  opts: { email: string; firstName?: string; category: string; userGroup: string }
) {
  const mapping = MEMBER_NOTIFICATION_EVENTS[opts.category];
  if (!mapping) {
    console.error(`No Loops notification mapping for category "${opts.category}"`);
    return null;
  }
  return sendEvent(env, {
    email: opts.email,
    firstName: opts.firstName,
    eventName: mapping.eventName,
    userGroup: opts.userGroup,
    source: "member-area",
  });
}
