// Blog post index — single source of truth for /blog listing and for
// linking posts into the /prepare roadmap stages (Roadmap.astro reads
// `stageId` to know which stage's `free` array to attach an "Article" item
// to). Add a new post here, then create src/pages/blog/[slug].astro.
//
// `date` is deliberately month-precision ("September 2026"), not a specific
// day — these are evergreen posts adapted from podcast/newsletter material,
// not dated news, and picking a specific day would imply a publish-date
// accuracy we don't actually have.
export const blogPosts = [
  {
    slug: "cost-of-a-baby",
    title: "How Much Is a Baby Actually Going to Cost You",
    dek: "Not the vague \"it's expensive\" warning everyone gives you. Real numbers, the budget moves that actually matter, and where the Prep Kit goes deeper.",
    description: "Real dollar figures for new and expecting dads — what a baby actually costs in year one, and the handful of budget moves that save more than any registry gadget.",
    date: "September 2026",
    isoMonth: "2026-09",
    readTime: "6 min read",
    stageId: "third-tri",
    source: "Adapted from Episode 28, \"How Much is This Baby Really Going to Cost Me?\"",
    image: "/images/blog/receipts-budget.jpg",
    faqs: [
      {
        q: "How much does a baby actually cost in the first year?",
        a: "There's no single number -- it depends on where you live, your insurance, and whether childcare is part of the plan. But the real cost buckets are predictable: one-time gear before the baby arrives, then recurring diapers and wipes, feeding, childcare, and healthcare.",
      },
      {
        q: "What's the single biggest baby expense in year one?",
        a: "Childcare, if both parents are working and daycare is part of the plan -- it's often the biggest line item on the whole list, bigger than diapers, formula, and gear combined.",
      },
      {
        q: "What baby items are okay to buy secondhand?",
        a: "Almost anything the baby will outgrow in under six months -- clothes, the early-stage car seat, and the bassinet -- as long as it's within its expiration date and wasn't in a wreck.",
      },
    ],
  },
  {
    slug: "emotional-side-of-fatherhood",
    title: "The Emotional Side of Fatherhood Nobody Talks About",
    dek: "The 2am doubt spirals. Feeling useless in the room. The pressure to have it together when you don't. Here's what actually helped.",
    description: "What nobody warns new and expecting dads about — the emotional side of fatherhood, and the one habit that keeps a bad week from becoming a bad marriage.",
    date: "September 2026",
    isoMonth: "2026-09",
    readTime: "5 min read",
    stageId: "8wk",
    source: "Adapted from Episode 27, \"The Emotional Side of Fatherhood Nobody Talks About\"",
    image: "/images/blog/quiet-moment.jpg",
    faqs: [
      {
        q: "Is it normal to feel emotionally overwhelmed as a new dad?",
        a: "Yes. The 2am doubt spirals and the feeling of being useless in the room are common -- they mean you care about doing this right, not that something's wrong with you.",
      },
      {
        q: "What's a new dad's actual job in the first weeks?",
        a: "Not having the answers -- being steady. Handing her water before she asks, taking the baby so she can shower, being the person who doesn't need managing on top of everything else she's already managing.",
      },
      {
        q: "What actually helps with the emotional side of fatherhood?",
        a: "Naming it out loud -- to your partner or another dad -- before it turns into a short temper or a distance you can't explain. Saying the sentence is the whole move.",
      },
    ],
  },
  {
    slug: "sitback-method",
    title: "The SITBACK Method: How We Got Our Twins Sleeping Through the Night",
    dek: "The Taking Cara Babies sleep method, translated for dads. Six steps, no fluff, the one thing that actually worked for us out of the NICU.",
    description: "A dad's breakdown of the Taking Cara Babies SITBACK Method — the sleep method that got the Dudela twins sleeping through the night straight out of the NICU.",
    date: "September 2026",
    isoMonth: "2026-09",
    readTime: "5 min read",
    stageId: "sleep-regression",
    source: "Personal account — the Taking Cara Babies SITBACK Method, as used by John's family.",
    image: "/images/blog/dad-crib.jpg",
    faqs: [
      {
        q: "What is the SITBACK Method?",
        a: "A gentle, step-by-step sleep method from Taking Cara Babies for when a baby stirs in the crib: Step back and pause, Increase the sound machine, Touch, Binky, Add rocking, Cuddles -- worked through in order, pausing between each to see if they settle.",
      },
      {
        q: "Is the SITBACK Method the same as cry-it-out?",
        a: "No. It's explicitly a gentle, gradual way to help a baby learn to self-soothe -- not a method for leaving a baby to cry alone.",
      },
      {
        q: "What age is the SITBACK Method for?",
        a: "It's not meant for babies under about 4 months old, since younger babies genuinely need more help settling. Check the program for exact age guidance for your situation.",
      },
    ],
  },
  {
    slug: "power-100-list",
    title: "The List That Changes How You See Your Life",
    dek: "A simple exercise from the book Wild Success — write down 100 things you're proud of, out loud, in the car. It sounds small. It isn't.",
    description: "A mindset exercise for dads adapted from Calvin Coyles' book Wild Success: build your own list of 100 things you're proud of, and what it reveals about where you actually feel alive.",
    date: "September 2026",
    isoMonth: "2026-09",
    readTime: "5 min read",
    stageId: "6mo",
    source: "Adapted from the \"Power 100\" exercise in Wild Success by Calvin Coyles.",
    image: "/images/blog/dad-driving-phone.jpg",
    faqs: [
      {
        q: "What is the \"Power 100\" exercise?",
        a: "An exercise from the book Wild Success by Calvin Coyles: say 100 things you're proud of, out loud -- not things you own or resume lines, but real moments, skills, decisions, and scars.",
      },
      {
        q: "Why say the list out loud instead of writing it down?",
        a: "Talking it out -- driving is ideal -- stops you from performing for an imaginary audience. The first 20 come fast, the next 30 get harder, and the last 20 surface things you'd forgotten you'd done.",
      },
      {
        q: "What's the point of the list?",
        a: "It's not a highlight reel -- it's proof. On the days fatherhood makes you feel like you're constantly failing, the list is evidence you've already done a hundred things worth being proud of.",
      },
    ],
  },
];

export function getBlogPost(slug) {
  return blogPosts.find((p) => p.slug === slug) || null;
}
