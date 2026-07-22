// The Dudela Podcast — full episode list. Titles, dates, and download counts
// pulled directly from the Podbean admin Episode List (authoritative source,
// confirmed Jul 2026) — this corrected several small errors from an earlier
// hand-transcription (e.g. "Sobriety" not "Solidly", "Diaper" not "Diapers",
// a few shifted dates).
//
// Newest first. Update this file as new episodes publish; homepage and podcast
// page both read from here so there's one source of truth.
//
// `link` = confirmed real Podbean episode URL (pulled directly from the show's
// live RSS feed at https://thedudelapodcast.podbean.com/feed.xml). The public
// show page embeds full show notes inline rather than linking to individual
// episode pages, and the RSS feed only returns the ~9 most recent episodes
// before truncating — so the older back-catalog doesn't have a confirmed
// direct link yet. Those fall back to the main show page below. To fill them
// in: open each episode in the Podbean dashboard and grab its public URL, or
// wait for it to roll into the RSS feed's recent window.
const SHOW_URL = "https://thedudelapodcast.podbean.com";
export const episodes = [
  { title: "Why Every Parent Needs Time Away Together", date: "2026-07-14", downloads: 198, link: "https://thedudelapodcast.podbean.com/e/why-every-parent-needs-time-away-together/" },
  { title: "How Much is This Baby Really Going to Cost Me?", date: "2026-07-01", downloads: 371, link: "https://thedudelapodcast.podbean.com/e/how-much-is-this-baby-really-going-to-cost-me/" },
  { title: "The Emotional Side of Fatherhood Nobody Talks About", date: "2026-06-16", downloads: 442, link: "https://thedudelapodcast.podbean.com/e/the-emotional-side-of-fatherhood-nobody-talks-about/" },
  { title: "Why We Started Dudela (And What's Next for New Dads)", date: "2026-06-02", downloads: 330, link: "https://thedudelapodcast.podbean.com/e/why-we-started-dudela-and-whats-next-for-new-dads/" },
  { title: "Family Matters: Designing Your Family on Purpose Part 1", date: "2026-05-13", downloads: 722, link: "https://thedudelapodcast.podbean.com/e/family-matters-designing-your-family-on-purpose-part-1/" },
  { title: "BONUS: We Built Something for You", date: "2026-05-13", downloads: 193, link: "https://thedudelapodcast.podbean.com/e/dudela-prep-kit/" },
  { title: "Family Matters Part 3: Rhythms, Mission, & Building your family with John Mackey", date: "2026-05-13", downloads: 252, link: "https://thedudelapodcast.podbean.com/e/family-matters-with-john-mackey-rhythms-mission-building-your-family/" },
  { title: "Becoming the Dad You Never Had", date: "2026-05-12", downloads: 598, link: "https://thedudelapodcast.podbean.com/e/becoming-the-dad-you-never-had/" },
  { title: "Family Matters: Parents, In Laws, and Protecting Your New Family", date: "2026-04-28", downloads: 485, link: "https://thedudelapodcast.podbean.com/e/family-matters-parents-in-laws-and-protecting-your-new-family-part-2/" },
  { title: "When to Prioritize Yourself as a Dad", date: "2026-03-24", downloads: 500, link: null },
  { title: "Traveling Dad: Work Trips, Dad Guilt, and Growth", date: "2026-02-24", downloads: 429, link: null },
  { title: "How to Balance Work and a Newborn Without Losing Your Mind", date: "2026-02-03", downloads: 660, link: null },
  { title: "What I Wish I Knew in Year One as a New Dad", date: "2025-12-30", downloads: 800, link: null },
  { title: "Surviving Twins: What the First Year Actually Looks Like", date: "2025-12-15", downloads: 472, link: null },
  { title: "Easy Financial Wins For Dads, Even on a Budget", date: "2025-11-25", downloads: 823, link: null },
  { title: "What Should I Focus On Right Now? Pregame for Fatherhood Before Baby Arrives", date: "2025-10-29", downloads: 1730, link: null },
  { title: "How Mentorship & Community Make You A Better Dad", date: "2025-10-08", downloads: 377, link: null },
  { title: "Finding Your Rhythm as a New Dad", date: "2025-09-16", downloads: 604, link: null },
  { title: "Coffee, Chaos & Kids: Stay-At-Home Dad Life", date: "2025-09-02", downloads: 257, link: null },
  { title: "Showing Up Present: Sobriety & New Dad Life with Corey Davis", date: "2025-08-19", downloads: 410, link: null },
  { title: "Deadlifts to Diapers: Your Dad Fitness Plan", date: "2025-08-05", downloads: 422, link: null },
  { title: "How To Be A Husband, A Dad, and A Dude", date: "2025-07-22", downloads: 389, link: null },
  { title: "Diaper, Delays & TSA: Travel Tips for Dads", date: "2025-07-07", downloads: 290, link: null },
  { title: "What Moms Actually Need From Dads", date: "2025-06-20", downloads: 836, link: null },
  { title: "So...What Does A Doula Do?", date: "2025-05-02", downloads: 607, link: null },
  { title: "Turning Dudes Into Dads: Welcome to Dudela", date: "2025-04-11", downloads: 492, link: null },
].map((ep) => ({ ...ep, link: ep.link || SHOW_URL }));
