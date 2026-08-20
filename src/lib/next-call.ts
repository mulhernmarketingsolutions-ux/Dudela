// Single source of truth for the next live Spit-Up Society Q&A. Update this
// file — nowhere else — each time a new call gets scheduled (twice a month).
//
// Every surface that needs to state the actual date/time imports from here:
// the join confirmation email (stripe-webhook.ts), the join thank-you page,
// and the member dashboard's join-info card. Before this file existed, the
// same date was hand-typed as a literal string in 5+ separate .astro/.ts
// files — easy to update four of them and miss one (which is exactly what
// happened: the site nav banner sat on a stale "Aug 4" date after the real
// schedule had already moved to Aug 20, with nothing to catch the mismatch).
//
// Evergreen marketing pages that people browse anytime before joining
// (Huddle.astro on the homepage, /join/spit-up-society's hero) deliberately
// do NOT import this and do NOT state a specific date — see the comments
// there. A prerendered marketing page showing a hardcoded date is a
// liability (it goes stale the moment this file is updated but that page
// isn't rebuilt/reviewed), so those pages describe the cadence ("twice a
// month") instead and save the actual date for the moment it's truly
// actionable: right after someone joins.
//
// `date` (ISO, in the call's actual timezone) drives the live countdown
// chip on the member dashboard — keep it in sync with dateLabel/timeLabel.
export const NEXT_CALL = {
  dateLabel: "Tuesday, September 1",
  timeLabel: "7:00 – 8:00pm MT",
  date: "2026-09-01T19:00:00-06:00",
  meetUrl: "https://meet.google.com/qrv-ceif-caf",
  phone: "+1 475-444-3646",
  pin: "741 991 265#",
};
