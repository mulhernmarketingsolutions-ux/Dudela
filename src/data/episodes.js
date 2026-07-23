// The Dudela Podcast — full episode list. Titles, dates, and download counts
// pulled directly from the Podbean admin Episode List (authoritative source,
// confirmed Jul 2026) — this corrected several small errors from an earlier
// hand-transcription (e.g. "Sobriety" not "Solidly", "Diaper" not "Diapers",
// a few shifted dates).
//
// Newest first. Update this file as new episodes publish; homepage and podcast
// page both read from here so there's one source of truth.
//
// `link`  = Podbean episode URL (confirmed via the show's live RSS feed).
// `apple` = Apple Podcasts episode URL (confirmed via Apple's public lookup API).
// `img`   = episode-specific cover art (only a couple of episodes have unique
//           art in the feed); everything else falls back to the show's cover.
// Podbean links only exist for the ~9 most recent episodes (feed truncates);
// Apple links exist for 23 of 26 (the oldest 3 — the welcome episode, the
// doula episode, and the "what moms need" episode — aren't in Apple's feed).
// Spotify and YouTube only have show-level links right now (see SPOTIFY_URL /
// YOUTUBE_URL below) — per-episode links on those two platforms would need
// either their APIs or manual collection.
const SHOW_URL = "https://thedudelapodcast.podbean.com";
const SHOW_COVER = "/images/podcast/show-cover.png";
export const SPOTIFY_URL = "https://open.spotify.com/show/19bw724AZVIygPb52pCOnQ";
export const YOUTUBE_URL = "https://www.youtube.com/@TheDudela-Official/videos";
export const APPLE_URL = "https://podcasts.apple.com/us/podcast/the-dudela-podcast-first-time-dad-help-and/id1807603921";

export const episodes = [
  { title: "Why Every Parent Needs Time Away Together", date: "2026-07-14", downloads: 198, link: "https://thedudelapodcast.podbean.com/e/why-every-parent-needs-time-away-together/", apple: "https://podcasts.apple.com/us/podcast/why-every-parent-needs-time-away-together/id1807603921?i=1000776812301", img: "/images/podcast/ep-why-every-parent.jpg" },
  { title: "How Much is This Baby Really Going to Cost Me?", date: "2026-07-01", downloads: 371, link: "https://thedudelapodcast.podbean.com/e/how-much-is-this-baby-really-going-to-cost-me/", apple: "https://podcasts.apple.com/us/podcast/how-much-is-this-baby-really-going-to-cost-me/id1807603921?i=1000775004576" },
  { title: "The Emotional Side of Fatherhood Nobody Talks About", date: "2026-06-16", downloads: 442, link: "https://thedudelapodcast.podbean.com/e/the-emotional-side-of-fatherhood-nobody-talks-about/", apple: "https://podcasts.apple.com/us/podcast/the-emotional-side-of-fatherhood-nobody-talks-about/id1807603921?i=1000772931930" },
  { title: "Why We Started Dudela (And What's Next for New Dads)", date: "2026-06-02", downloads: 330, link: "https://thedudelapodcast.podbean.com/e/why-we-started-dudela-and-whats-next-for-new-dads/", apple: "https://podcasts.apple.com/us/podcast/why-we-started-dudela-and-whats-next-for-new-dads/id1807603921?i=1000770756829" },
  { title: "Family Matters: Designing Your Family on Purpose Part 1", date: "2026-05-13", downloads: 722, link: "https://thedudelapodcast.podbean.com/e/family-matters-designing-your-family-on-purpose-part-1/", apple: "https://podcasts.apple.com/us/podcast/family-matters-designing-your-family-on-purpose-part-1/id1807603921?i=1000759986311" },
  { title: "BONUS: We Built Something for You", date: "2026-05-13", downloads: 193, link: "https://thedudelapodcast.podbean.com/e/dudela-prep-kit/", apple: "https://podcasts.apple.com/us/podcast/bonus-we-built-something-for-you/id1807603921?i=1000767636755" },
  { title: "Family Matters Part 3: Rhythms, Mission, & Building your family with Josh Mackey", date: "2026-05-13", downloads: 252, link: "https://thedudelapodcast.podbean.com/e/family-matters-with-john-mackey-rhythms-mission-building-your-family/", apple: "https://podcasts.apple.com/us/podcast/family-matters-part-3-rhythms-mission-building-your/id1807603921?i=1000767570923" },
  { title: "Becoming the Dad You Never Had", date: "2026-05-12", downloads: 598, link: "https://thedudelapodcast.podbean.com/e/becoming-the-dad-you-never-had/", apple: "https://podcasts.apple.com/us/podcast/becoming-the-dad-you-never-had/id1807603921?i=1000754054790" },
  { title: "Family Matters: Parents, In Laws, and Protecting Your New Family", date: "2026-04-28", downloads: 485, link: "https://thedudelapodcast.podbean.com/e/family-matters-parents-in-laws-and-protecting-your-new-family-part-2/", apple: "https://podcasts.apple.com/us/podcast/family-matters-parents-in-laws-and-protecting-your/id1807603921?i=1000764112998" },
  { title: "When to Prioritize Yourself as a Dad", date: "2026-03-24", downloads: 500, link: null, apple: "https://podcasts.apple.com/us/podcast/when-to-prioritize-yourself-as-a-dad/id1807603921?i=1000757073212" },
  { title: "Traveling Dad: Work Trips, Dad Guilt, and Growth", date: "2026-02-24", downloads: 429, link: null, apple: "https://podcasts.apple.com/us/podcast/traveling-dad-work-trips-dad-guilt-and-growth/id1807603921?i=1000751233563" },
  { title: "How to Balance Work and a Newborn Without Losing Your Mind", date: "2026-02-03", downloads: 660, link: null, apple: "https://podcasts.apple.com/us/podcast/how-to-balance-work-and-a-newborn-without-losing-your-mind/id1807603921?i=1000747832175" },
  { title: "What I Wish I Knew in Year One as a New Dad", date: "2025-12-30", downloads: 800, link: null, apple: "https://podcasts.apple.com/us/podcast/what-i-wish-i-knew-in-year-one-as-a-new-dad/id1807603921?i=1000743178603" },
  { title: "Surviving Twins: What the First Year Actually Looks Like", date: "2025-12-15", downloads: 472, link: null, apple: "https://podcasts.apple.com/us/podcast/surviving-twins-what-the-first-year-actually-looks-like/id1807603921?i=1000741348981" },
  { title: "Easy Financial Wins For Dads, Even on a Budget", date: "2025-11-25", downloads: 823, link: null, apple: "https://podcasts.apple.com/us/podcast/easy-financial-wins-for-dads-even-on-a-budget/id1807603921?i=1000738334187" },
  { title: "What Should I Focus On Right Now? Pregame for Fatherhood Before Baby Arrives", date: "2025-10-29", downloads: 1730, link: null, apple: "https://podcasts.apple.com/us/podcast/what-should-i-focus-on-right-now-pregame-for-fatherhood/id1807603921?i=1000734044050" },
  { title: "How Mentorship & Community Make You A Better Dad", date: "2025-10-08", downloads: 377, link: null, apple: "https://podcasts.apple.com/us/podcast/how-mentorship-community-make-you-a-better-dad/id1807603921?i=1000730792249" },
  { title: "Finding Your Rhythm as a New Dad", date: "2025-09-16", downloads: 604, link: null, apple: "https://podcasts.apple.com/us/podcast/finding-your-rhythm-as-a-new-dad/id1807603921?i=1000727039816" },
  { title: "Coffee, Chaos & Kids: Stay-At-Home Dad Life", date: "2025-09-02", downloads: 257, link: null, apple: "https://podcasts.apple.com/us/podcast/coffee-chaos-kids-stay-at-home-dad-life/id1807603921?i=1000724484829" },
  { title: "Showing Up Present: Sobriety & New Dad Life with Corey Davis", date: "2025-08-19", downloads: 410, link: null, apple: "https://podcasts.apple.com/us/podcast/showing-up-present-sobriety-new-dad-life-with-corey-davis/id1807603921?i=1000725570995", img: "/images/podcast/ep-corey-davis.jpg" },
  { title: "Deadlifts to Diapers: Your Dad Fitness Plan", date: "2025-08-05", downloads: 422, link: null, apple: "https://podcasts.apple.com/us/podcast/deadlifts-to-diapers-your-dad-fitness-plan/id1807603921?i=1000725570910" },
  { title: "How To Be A Husband, A Dad, and A Dude", date: "2025-07-22", downloads: 389, link: null, apple: "https://podcasts.apple.com/us/podcast/how-to-be-a-husband-a-dad-and-a-dude/id1807603921?i=1000718460364" },
  { title: "Diaper, Delays & TSA: Travel Tips for Dads", date: "2025-07-07", downloads: 290, link: null, apple: "https://podcasts.apple.com/us/podcast/diaper-delays-tsa-travel-tips-for-dads/id1807603921?i=1000716190392" },
  { title: "What Moms Actually Need From Dads", date: "2025-06-20", downloads: 836, link: null, apple: null },
  { title: "So...What Does A Doula Do?", date: "2025-05-02", downloads: 607, link: null, apple: null },
  { title: "Turning Dudes Into Dads: Welcome to Dudela", date: "2025-04-11", downloads: 492, link: null, apple: null },
].map((ep) => ({
  ...ep,
  link: ep.link || SHOW_URL,
  apple: ep.apple || APPLE_URL,
  img: ep.img || SHOW_COVER,
}));
