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

export async function sendLoopsEvent(
  env: LoopsEnv,
  opts: { email: string; name?: string; magnet: string; source?: string }
) {
  const mapping = LOOPS_EVENTS[opts.magnet] || LOOPS_EVENTS["newsletter"];
  const firstName = opts.name ? opts.name.split(" ")[0] : undefined;

  const res = await fetch("https://app.loops.so/api/v1/events/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.LOOPS_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: opts.email,
      firstName,
      eventName: mapping.eventName,
      userGroup: mapping.userGroup,
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
