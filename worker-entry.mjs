// Worker entry point. Wraps Astro's built worker so we can add a daily cron
// (see [triggers] in wrangler.toml) without touching Astro's output.
import astro from "./dist/_worker.js/index.js";
import { sendDueDateEmails } from "./src/lib/due-date-sender.ts";

export default {
  ...astro,
  fetch: (request, env, ctx) => astro.fetch(request, env, ctx),
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendDueDateEmails(env));
  },
};
