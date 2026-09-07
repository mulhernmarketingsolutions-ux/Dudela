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
  "slug": "how-to-support-your-pregnant-wife",
  "title": "How to Support Your Pregnant Wife: What She Actually Needs From You",
  "dek": "She should not have to become your project manager to get through pregnancy. Here is how to take real weight off her day.",
  "description": "How to support your pregnant wife with practical help, better conversations, shared planning, and a clear plan for each trimester and the first days home.",
  "stageId": "12wk",
  "image": "/images/John+and+Viv-40.webp",
  "readTime": "8 min read",
  "faqs": [
    {
      "q": "What does a pregnant wife need from her husband?",
      "a": "Ask what feels hardest, listen without dismissing it, and take ownership of recurring work such as meals, laundry, and shared planning. Learn about pregnancy yourself and respect her choices about appointments, comfort, and birth."
    },
    {
      "q": "How can I help my pregnant wife when she is exhausted?",
      "a": "Make rest possible by handling dinner, cleanup, errands, and care for older children. Offer specific help instead of another decision. If her exhaustion feels concerning or comes with other symptoms, help her contact her pregnancy care team."
    },
    {
      "q": "How do I support my pregnant wife emotionally?",
      "a": "Believe her experience, ask whether she wants listening or practical help, and follow through on what you agree to do. Avoid explaining her feelings away as hormones. Make room for excitement, worry, frustration, and mixed feelings."
    },
    {
      "q": "What should a dad do in the third trimester?",
      "a": "Confirm leave and transport plans, pack the hospital bag, discuss birth preferences, learn basic baby care, and arrange meals and practical support for recovery. Save the care team contact details and follow their instructions about when to call."
    }
  ],
  "date": "September 2026",
  "isoMonth": "2026-09",
  "source": "Dudela editorial guide, with related podcast listening and linked care guidance."
},
{
  "slug": "what-should-a-dad-do-during-labor",
  "title": "What Should a Dad Do During Labor? A First Time Dad's Guide",
  "dek": "You do not need a delivery room speech. You need to know her preferences, handle the practical stuff, and stay useful when the plan changes.",
  "description": "What should a dad do during labor? A practical guide to comfort, communication, hospital preparation, changing birth plans, and the first hours after birth.",
  "stageId": "hospital",
  "image": "/images/mike-riley-face-to-face.png",
  "readTime": "8 min read",
  "faqs": [
    {
      "q": "What is a dad’s role during labor?",
      "a": "Provide the support your partner wants, handle logistics, help communicate her preferences, and follow the care team’s guidance. Ask before touching or coaching her. Her comfort and choices should guide your support."
    },
    {
      "q": "What should a dad pack for the hospital?",
      "a": "Bring identification, a charger, a change of clothes, toiletries, your own snacks and water, and the contact details and paperwork your hospital requests. Check the hospital’s rules and use a shared checklist for your partner and baby."
    },
    {
      "q": "What should I say to my wife during labor?",
      "a": "Use brief, reassuring phrases such as “I am here” or “Do you want quiet or encouragement?” Avoid promising how soon birth will happen or telling her a medical decision is easy. Listen when she tells you what helps."
    },
    {
      "q": "How can a dad help during a C section?",
      "a": "Ask the team where you can be and what to expect. If you can stay with your partner, offer calm reassurance and keep her informed as the team advises. Afterward, help with practical tasks and follow her recovery instructions."
    },
    {
      "q": "What if I feel faint in the delivery room?",
      "a": "Tell a nurse or another member of the care team immediately and sit down safely. Do not try to push through it while holding your partner or baby. Let the team help you so you can return to supporting her."
    }
  ],
  "date": "September 2026",
  "isoMonth": "2026-09",
  "source": "Dudela editorial guide, with related podcast listening and linked care guidance."
},
{
  "slug": "first-time-dad-guide",
  "title": "First Time Dad Guide: 21 Things I Wish I Knew Before Becoming a Father",
  "dek": "The gear is the easy part. Here are the conversations, habits, and practical moves that deserve a place on your list before the baby arrives.",
  "description": "A first time dad guide with 21 practical lessons on pregnancy, labor, newborn care, money, sleep, your relationship, and finding support as a new father.",
  "stageId": "8wk",
  "image": "/images/john-kissing-twins.webp",
  "readTime": "10 min read",
  "faqs": [
    {
      "q": "How do I prepare to be a first time dad?",
      "a": "Start by supporting your partner, learning basic baby care, planning leave and household costs, and talking through birth and the first days home. Choose a few practical tasks each week rather than trying to learn everything at once."
    },
    {
      "q": "Is it normal to feel scared about becoming a father?",
      "a": "Many expecting dads feel both excited and scared. Talk to your partner or someone you trust. If worry, low mood, or anger is persistent or makes daily life hard, speak with a qualified health professional."
    },
    {
      "q": "What should a new dad do in the first week?",
      "a": "Share baby care, protect your partner’s recovery time, handle meals and household tasks, and keep track of follow up instructions together. Follow your baby’s feeding plan and safe sleep guidance, and ask the care team when you are unsure."
    },
    {
      "q": "How can a dad bond with a newborn?",
      "a": "Build familiarity through everyday care: holding your baby safely while awake, talking, changing diapers, soothing, and participating in feeding as appropriate. Connection may grow gradually through repetition."
    },
    {
      "q": "What does a first time dad actually need to buy?",
      "a": "Prioritize an appropriate car seat for travel, a safe infant sleep space, diapers, basic clothing, and feeding supplies suited to your plan. Confirm safety and suitability before buying. A long registry is not a requirement for being prepared."
    }
  ],
  "date": "September 2026",
  "isoMonth": "2026-09",
  "source": "Dudela editorial guide, with related podcast listening and linked care guidance."
},
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
