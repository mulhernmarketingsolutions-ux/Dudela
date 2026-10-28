// Sends "Your Week, In Your Inbox" emails. Called once a day by the cron in
// worker-entry.mjs. For each active member with a due date, works out their
// current week of pregnancy (40 minus whole weeks until the due date) and
// sends that week's email from src/data/due-date-emails.ts if they haven't
// had it yet. Missed weeks are skipped, never back-filled.

import { WEEK_EMAILS } from "../data/due-date-emails";
import { sendEmail, type EmailEnv } from "./email";

interface Env extends EmailEnv {
  DB: any;
}

export function currentWeek(dueDate: string, now = new Date()): number {
  const due = new Date(dueDate + "T12:00:00Z").getTime();
  const today = new Date(now.toISOString().slice(0, 10) + "T12:00:00Z").getTime();
  const daysUntil = Math.round((due - today) / 86400000);
  if (daysUntil < 0) return 41;
  return 40 - Math.floor(daysUntil / 7);
}

function emailHtml(name: string | null, body: string[], stopUrl: string) {
  const first = name ? name.split(" ")[0] : "";
  const paras = [first ? `Hey ${first},` : "Hey,", ...body, "John"]
    .map((p) => `<p style="color:#1c2319;font-size:17px;line-height:1.6;margin:0 0 18px;">${p.replace(/(thedudelaco\.com\/[a-z/-]+)/g, '<a href="https://$1" style="color:#c2621b;">$1</a>')}</p>`)
    .join("");
  return `
    <div style="background:#12180f;padding:40px 16px;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:520px;margin:0 auto;background:#f5efe3;border-radius:14px;overflow:hidden;">
        <div style="background:#1c2319;padding:22px 32px;text-align:center;">
          <img src="https://thedudelaco.com/logo/dudela-logo-white-full.png" alt="Dudela" style="height:32px;width:auto;display:inline-block;" />
        </div>
        <div style="padding:32px;">${paras}</div>
        <div style="padding:0 32px 28px;color:#6b7563;font-size:12px;line-height:1.6;">
          You're getting this because you added a due date to your Spit-Up Society membership.
          This is general information, not medical advice. Ask her provider about anything specific.
          <a href="${stopUrl}" style="color:#6b7563;">Stop these weekly emails</a>.
        </div>
      </div>
    </div>`;
}

export async function sendDueDateEmails(env: Env, origin = "https://thedudelaco.com") {
  let rows: any[] = [];
  try {
    const res = await env.DB.prepare(
      "SELECT id, email, name, due_date, due_last_week FROM members WHERE status = 'active' AND due_date IS NOT NULL"
    ).all();
    rows = res.results || [];
  } catch (err) {
    console.error("Due-date query failed (migrations applied?):", err);
    return { sent: 0 };
  }

  let sent = 0;
  for (const m of rows) {
    const week = currentWeek(m.due_date);
    if (week < 10 || week > 40) continue;
    if (m.due_last_week != null && week <= m.due_last_week) continue;
    const email = WEEK_EMAILS.find((e) => e.week === week);
    if (!email) continue;
    try {
      await sendEmail(env, {
        to: m.email,
        subject: email.subject,
        html: emailHtml(m.name, email.body, `${origin}/api/due-date-stop?m=${m.id}`),
        replyTo: "dude@thedudelaco.com",
      });
      await env.DB.prepare("UPDATE members SET due_last_week = ? WHERE id = ?").bind(week, m.id).run();
      sent++;
    } catch (err) {
      console.error(`Due-date email failed for ${m.email}:`, err);
    }
  }
  console.log(`Due-date emails sent: ${sent}`);
  return { sent };
}
