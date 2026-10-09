// BabySense Pro giveaway (Oct 2026), run with BabySense as part of the
// Elad Erdan podcast cross-promo. One source of truth for the entry window,
// used by /babysense (which form to show), /babysense/rules, and
// /api/lead-magnet (which refuses to tag an entry outside the window).
// All times are Mountain Time.
export const GIVEAWAY = {
  start: new Date("2026-10-09T00:00:00-06:00"),
  end: new Date("2026-10-27T23:59:59-06:00"),
  startLabel: "Friday, October 9, 2026",
  endLabel: "Tuesday, October 27, 2026",
  drawLabel: "Wednesday, October 28, 2026",
  prize: "BabySense Pro baby monitor",
  // Official product photo from BabySense's own Shopify store (1-camera Pro).
  prizeImage: "https://cdn.shopify.com/s/files/1/0427/9572/9059/files/babysense-pro-video-baby-monitor-with-1-camera-non-wifi-split-screen-night-light-sound-machine-3200127.png?v=1780014248",
  instagram: "https://www.instagram.com/the_dudela_official/",
  instagramHandle: "@the_dudela_official",
};

export type GiveawayState = "before" | "open" | "closed";

export function giveawayState(now = new Date()): GiveawayState {
  if (now < GIVEAWAY.start) return "before";
  if (now > GIVEAWAY.end) return "closed";
  return "open";
}

// BabySense's 10% off code for Dudela listeners.
export const BABYSENSE_CODE = "DudeLA10";
