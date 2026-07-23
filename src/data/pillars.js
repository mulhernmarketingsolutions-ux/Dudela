// The six pillars — the real Dudela framework (naming still pending; refer to
// as "the six pillars" or "the Dudela framework" until John names it).
// This is the single source of truth: homepage, About, and the Prep Kit page
// all read from here so the site never shows competing pillar sets again.
//
// TODO (pending photo drop from John): "head-right" should become the photo
// of Mike smiling, wearing the Dudela hat, holding a newborn — that image was
// only pasted inline in chat, not saved to /public/images, so it can't be
// wired in yet. Swap it in once it's dropped in the folder.
export const pillars = [
  {
    slug: "head-right",
    name: "Get Your Head Right",
    line: "The emotional side nobody warns you about.",
    img: "/images/dad-kiss-twins.jpg",
  },
  {
    slug: "money-ready",
    name: "Get Your Money Ready",
    line: "Real numbers, real wins, even on a budget.",
    img: "/images/IMG_3904_(1).webp",
  },
  {
    slug: "partner",
    name: "Be The Partner She Needs",
    line: "Your marriage changes too.",
    img: "/images/founder-mike.jpg",
  },
  {
    slug: "walking-into",
    name: "Know What You're Walking Into",
    line: "Know exactly what's coming.",
    img: "/images/mike-riley-face-to-face.png",
  },
  {
    slug: "kind-of-dad",
    name: "Decide What Kind of Dad You Want to Be",
    line: "Become the dad your family needs.",
    img: "/images/dad-twins-playful.jpg",
  },
  {
    slug: "first-days-home",
    name: "First Days Home Playbook",
    line: "Survive the first days without losing yourself.",
    // TODO (pending photo drop from John): should become John kissing the
    // girls, holding both — also only pasted inline in chat, not yet a file.
    img: "/images/IMG_3499_VSCO.JPG",
  },
];
