// The Dudela Workshop — live small-group session on Zoom with John & Mike.
// First Thursday of the month, 7:00–8:30pm MT. Single source of truth for the
// dates: /workshop renders from this, and create-checkout-session.ts only
// accepts a `date` that appears here (and hasn't passed). Add the next
// quarter's dates here when Q1 2027 winds down.
//
// Runs with 3+ dads. If a date doesn't fill, buyers choose: move to the next
// date, swap for a 1:1 call with John or Mike, or a full refund.
export const WORKSHOP_PRICE = "$147";
export const WORKSHOP_MIN_DADS = 3;
export const WORKSHOP_MAX_DADS = 5;
export const WORKSHOP_TIME = "7:00–8:30pm MT";

export const WORKSHOP_DATES: { iso: string; label: string }[] = [
  { iso: "2026-11-05", label: "Thursday, November 5" },
  { iso: "2026-12-03", label: "Thursday, December 3" },
  { iso: "2027-01-07", label: "Thursday, January 7" },
  { iso: "2027-02-04", label: "Thursday, February 4" },
  { iso: "2027-03-04", label: "Thursday, March 4" },
];

// A session is bookable until 5pm MT on the day of (2 hours before start).
// MT is UTC-7 in winter / UTC-6 in summer; every date above is in MST (UTC-7).
export function isBookable(iso: string, now = new Date()): boolean {
  const cutoff = new Date(`${iso}T17:00:00-07:00`);
  return now < cutoff;
}

export function findWorkshopDate(iso: string | null | undefined) {
  if (!iso) return undefined;
  return WORKSHOP_DATES.find((d) => d.iso === iso);
}
