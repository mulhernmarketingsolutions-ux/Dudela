// One place for the Prep Kit add-ons and the Game Plan Call (added 2026-10-19).
// Pricing ladder: Prep Kit $37 -> $17 checkbox (Her Copy + Delivery Room Pack)
// -> one-click Game Plan Call $97 for kit buyers. The call bought on its own
// is $200 and includes the kit and both add-ons. The call fee is credited
// toward The Turn if they join within 14 days.

export const CALENDLY_URL = "https://calendly.com/dude-thedudelaco/game-plan-call";

export const DOWNLOADS = {
  kit: { label: "The Dudela Prep Kit", url: "https://thedudelaco.com/downloads/dudela-prep-kit.pdf" },
  herCopy: { label: "Her Copy", url: "https://thedudelaco.com/downloads/dudela-her-copy.pdf" },
  deliveryPack: { label: "The Delivery Room Pack", url: "https://thedudelaco.com/downloads/dudela-delivery-room-pack.pdf" },
};

export const ADDON_DOWNLOADS = [DOWNLOADS.herCopy, DOWNLOADS.deliveryPack];

export const CALL = {
  name: "Game Plan Call",
  listCents: 20000,
  kitPriceCents: 9700,
  length: "1 hour",
};

// Checkout add-on prices (on top of the $37 kit). Either one on its own, or
// both together for $17. ?addon= on the kit checkout URL picks one;
// "1" is the old value and means both.
export const KIT_ADDONS: Record<string, { name: string; cents: number; downloads: { label: string; url: string }[] }> = {
  both: { name: "Her Copy + Delivery Room Pack", cents: 1700, downloads: [DOWNLOADS.herCopy, DOWNLOADS.deliveryPack] },
  her: { name: "Her Copy (add-on price)", cents: 1200, downloads: [DOWNLOADS.herCopy] },
  pack: { name: "The Delivery Room Pack (add-on price)", cents: 800, downloads: [DOWNLOADS.deliveryPack] },
};
export function kitAddon(value?: string | null) {
  if (!value) return undefined;
  return KIT_ADDONS[value === "1" ? "both" : value];
}
