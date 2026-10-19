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
