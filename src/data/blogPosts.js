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
    readTime: "6 min read",
    stageId: "third-tri",
    source: "Adapted from Episode 28, \"How Much is This Baby Really Going to Cost Me?\"",
  },
  {
    slug: "emotional-side-of-fatherhood",
    title: "The Emotional Side of Fatherhood Nobody Talks About",
    dek: "The 2am doubt spirals. Feeling useless in the room. The pressure to have it together when you don't. Here's what actually helped.",
    description: "What nobody warns new and expecting dads about — the emotional side of fatherhood, and the one habit that keeps a bad week from becoming a bad marriage.",
    date: "September 2026",
    readTime: "5 min read",
    stageId: "8wk",
    source: "Adapted from Episode 27, \"The Emotional Side of Fatherhood Nobody Talks About\"",
  },
];

export function getBlogPost(slug) {
  return blogPosts.find((p) => p.slug === slug) || null;
}
