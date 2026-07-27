// Thin D1 data-access layer for the member area (magic-link auth, Womb Watch
// posts, member-submitted questions). Same "no ORM, just plain queries"
// philosophy as the fetch-based lib/stripe.ts and lib/loops.ts — this is a
// small site, not a place that needs Drizzle/Prisma overhead.
//
// Requires a D1 binding named `DB` in wrangler.toml (see the [[d1_databases]]
// block there) and the schema in migrations/0001_init.sql applied to it.

export interface DbEnv {
  DB: D1Database;
}

export interface Member {
  id: string;
  email: string;
  name: string | null;
  product: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: "active" | "canceled";
  created_at: string;
  updated_at: string;
}

export interface Post {
  id: string;
  title: string;
  body: string;
  category: string;
  published_at: string;
  created_at: string;
  // Added for Womb Watch mini-episodes (video-embed post type). Nullable —
  // plain text posts in other future categories don't need these.
  video_url: string | null;
  thumbnail_url: string | null;
  week_label: string | null;
}

export interface Inquiry {
  id: string;
  member_email: string;
  member_name: string | null;
  question: string;
  status: "new" | "answered";
  created_at: string;
}

// One per member — the "perceived community" bubble on /member/community.
// Not a feed/forum, just a snapshot: who they are, where, what stage,
// and one thing they've learned. Resubmitting updates their existing row
// rather than creating a second bubble (see upsertCommunityNote).
export interface CommunityNote {
  id: string;
  member_id: string;
  first_name: string;
  city: string | null;
  dad_stage: string | null;
  advice: string;
  created_at: string;
  updated_at: string;
}

// Hex-encoded random token via Web Crypto (same API already used in
// lib/stripe.ts for signature verification) — no Node crypto needed.
export function randomToken(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function getMemberByEmail(env: DbEnv, email: string): Promise<Member | null> {
  const row = await env.DB.prepare("SELECT * FROM members WHERE email = ?")
    .bind(email.trim().toLowerCase())
    .first<Member>();
  return row ?? null;
}

// Used to fan out a Loops notification event when a new Womb Watch post
// (or future member-only content) is published — see lib/loops.ts.
export async function listActiveMembers(env: DbEnv, product = "spit-up-society"): Promise<Member[]> {
  const res = await env.DB.prepare("SELECT * FROM members WHERE product = ? AND status = 'active'")
    .bind(product)
    .all<Member>();
  return res.results ?? [];
}

export async function getMemberById(env: DbEnv, id: string): Promise<Member | null> {
  const row = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first<Member>();
  return row ?? null;
}

// Called from the Stripe webhook on checkout.session.completed for a
// membership product — creates the member row if this is a new subscriber,
// or reactivates + refreshes it if they're rejoining after a cancellation.
export async function upsertMemberFromStripe(
  env: DbEnv,
  opts: { email: string; name?: string; product: string; stripeCustomerId?: string; stripeSubscriptionId?: string }
): Promise<Member> {
  const email = opts.email.trim().toLowerCase();
  const existing = await getMemberByEmail(env, email);
  const now = new Date().toISOString();

  if (existing) {
    await env.DB.prepare(
      `UPDATE members
       SET name = COALESCE(?, name), status = 'active', stripe_customer_id = COALESCE(?, stripe_customer_id),
           stripe_subscription_id = COALESCE(?, stripe_subscription_id), updated_at = ?
       WHERE id = ?`
    )
      .bind(opts.name || null, opts.stripeCustomerId || null, opts.stripeSubscriptionId || null, now, existing.id)
      .run();
    return (await getMemberById(env, existing.id))!;
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO members (id, email, name, product, stripe_customer_id, stripe_subscription_id, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`
  )
    .bind(id, email, opts.name || null, opts.product, opts.stripeCustomerId || null, opts.stripeSubscriptionId || null, now, now)
    .run();
  return (await getMemberById(env, id))!;
}

// Called from the Stripe webhook on customer.subscription.deleted. Marks the
// member as canceled rather than deleting them — they keep their login and
// post history, but gated pages can show a "your membership lapsed" state
// and a rejoin link instead of pretending they're still active.
export async function markMemberCanceledByStripeCustomerId(env: DbEnv, stripeCustomerId: string): Promise<void> {
  await env.DB.prepare(`UPDATE members SET status = 'canceled', updated_at = ? WHERE stripe_customer_id = ?`)
    .bind(new Date().toISOString(), stripeCustomerId)
    .run();
}

// --- Magic-link login ---

const MAGIC_LINK_TTL_MINUTES = 20;
const SESSION_TTL_DAYS = 30;

export async function createMagicLink(env: DbEnv, email: string): Promise<string> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MINUTES * 60 * 1000).toISOString();
  await env.DB.prepare(`INSERT INTO magic_links (token, email, expires_at) VALUES (?, ?, ?)`)
    .bind(token, email.trim().toLowerCase(), expiresAt)
    .run();
  return token;
}

// Verifies + burns a magic-link token. Distinguishes "token invalid/expired/
// already used" from "token was fine but that email isn't (or isn't any
// longer) a member" — /api/auth/verify.ts uses this to show a friendlier,
// on-brand "join instead" message for the latter rather than a generic
// "expired" error that doesn't fit what actually happened.
export type MagicLinkResult =
  | { status: "ok"; member: Member }
  | { status: "invalid" }
  | { status: "not-a-member" };

export async function consumeMagicLink(env: DbEnv, token: string): Promise<MagicLinkResult> {
  const row = await env.DB.prepare("SELECT * FROM magic_links WHERE token = ?")
    .bind(token)
    .first<{ token: string; email: string; expires_at: string; used_at: string | null }>();
  if (!row) return { status: "invalid" };
  if (row.used_at) return { status: "invalid" };
  if (new Date(row.expires_at).getTime() < Date.now()) return { status: "invalid" };

  await env.DB.prepare("UPDATE magic_links SET used_at = ? WHERE token = ?")
    .bind(new Date().toISOString(), token)
    .run();

  const member = await getMemberByEmail(env, row.email);
  if (!member) return { status: "not-a-member" };
  return { status: "ok", member };
}

export async function createSession(env: DbEnv, memberId: string): Promise<{ token: string; expiresAt: string }> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare(`INSERT INTO sessions (token, member_id, expires_at) VALUES (?, ?, ?)`)
    .bind(token, memberId, expiresAt)
    .run();
  return { token, expiresAt };
}

export async function getMemberBySessionToken(env: DbEnv, token: string): Promise<Member | null> {
  if (!token) return null;
  const row = await env.DB.prepare("SELECT * FROM sessions WHERE token = ?")
    .bind(token)
    .first<{ token: string; member_id: string; expires_at: string }>();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return getMemberById(env, row.member_id);
}

export async function deleteSession(env: DbEnv, token: string): Promise<void> {
  await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
}

// --- Admin (John/Mike posting UI) sessions ---
// Deliberately separate from member sessions/table — this is a single shared
// password (ADMIN_PASSWORD secret), not per-person accounts. Simple on
// purpose: two founders, not a team that needs individual admin logins.

export async function createAdminSession(env: DbEnv): Promise<string> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare(`INSERT INTO admin_sessions (token, expires_at) VALUES (?, ?)`).bind(token, expiresAt).run();
  return token;
}

export async function isAdminSessionValid(env: DbEnv, token: string): Promise<boolean> {
  if (!token) return false;
  const row = await env.DB.prepare("SELECT expires_at FROM admin_sessions WHERE token = ?")
    .bind(token)
    .first<{ expires_at: string }>();
  if (!row) return false;
  return new Date(row.expires_at).getTime() >= Date.now();
}

export async function deleteAdminSession(env: DbEnv, token: string): Promise<void> {
  await env.DB.prepare("DELETE FROM admin_sessions WHERE token = ?").bind(token).run();
}

// --- Womb Watch posts ---

export async function listPosts(env: DbEnv, category = "womb-watch", limit = 50): Promise<Post[]> {
  const res = await env.DB.prepare(
    `SELECT * FROM posts WHERE category = ? ORDER BY published_at DESC LIMIT ?`
  )
    .bind(category, limit)
    .all<Post>();
  return res.results ?? [];
}

export async function createPost(
  env: DbEnv,
  opts: {
    title: string;
    body: string;
    category?: string;
    videoUrl?: string;
    thumbnailUrl?: string;
    weekLabel?: string;
  }
): Promise<Post> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO posts (id, title, body, category, published_at, created_at, video_url, thumbnail_url, week_label)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      opts.title,
      opts.body,
      opts.category || "womb-watch",
      now,
      now,
      opts.videoUrl || null,
      opts.thumbnailUrl || null,
      opts.weekLabel || null
    )
    .run();
  return (await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first<Post>())!;
}

export async function deletePost(env: DbEnv, id: string): Promise<void> {
  await env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(id).run();
}

// --- Member inquiries (questions submitted for the live Q&A / anytime) ---

// --- Community notes (the floating bubble cloud on /member/community) ---

// One bubble per member: fill it out once, resubmitting edits it in place
// rather than piling up duplicates. member_id has a UNIQUE constraint
// (migrations/0003) so this is a plain upsert.
export async function upsertCommunityNote(
  env: DbEnv,
  opts: { memberId: string; firstName: string; city?: string; dadStage?: string; advice: string }
): Promise<CommunityNote> {
  const now = new Date().toISOString();
  const existing = await env.DB.prepare("SELECT id FROM community_notes WHERE member_id = ?")
    .bind(opts.memberId)
    .first<{ id: string }>();

  if (existing) {
    await env.DB.prepare(
      `UPDATE community_notes SET first_name = ?, city = ?, dad_stage = ?, advice = ?, updated_at = ? WHERE member_id = ?`
    )
      .bind(opts.firstName, opts.city || null, opts.dadStage || null, opts.advice, now, opts.memberId)
      .run();
    return (await env.DB.prepare("SELECT * FROM community_notes WHERE member_id = ?").bind(opts.memberId).first<CommunityNote>())!;
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO community_notes (id, member_id, first_name, city, dad_stage, advice, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, opts.memberId, opts.firstName, opts.city || null, opts.dadStage || null, opts.advice, now, now)
    .run();
  return (await env.DB.prepare("SELECT * FROM community_notes WHERE id = ?").bind(id).first<CommunityNote>())!;
}

export async function listCommunityNotes(env: DbEnv, limit = 60): Promise<CommunityNote[]> {
  const res = await env.DB.prepare(`SELECT * FROM community_notes ORDER BY created_at DESC LIMIT ?`)
    .bind(limit)
    .all<CommunityNote>();
  return res.results ?? [];
}

export async function getCommunityNoteByMemberId(env: DbEnv, memberId: string): Promise<CommunityNote | null> {
  const row = await env.DB.prepare("SELECT * FROM community_notes WHERE member_id = ?").bind(memberId).first<CommunityNote>();
  return row ?? null;
}

// --- Merch presale orders (hat colorways, scarcity cap) ---

export interface MerchOrder {
  id: string;
  session_id: string;
  color: string;
  email: string;
  name: string | null;
  shipping_name: string | null;
  shipping_address: string | null;
  amount_total: number | null;
  created_at: string;
}

// Presale scarcity: 10 units per colorway. Checked before creating a Stripe
// Checkout Session (create-checkout-session.ts) so we never sell more than
// exist, and again isn't re-checked in the webhook — session_id's UNIQUE
// constraint is what actually prevents a double-sell on a Stripe retry, this
// count is just the "is this color sold out" gate for new checkouts.
export async function countMerchOrders(env: DbEnv, color: string): Promise<number> {
  const row = await env.DB.prepare("SELECT COUNT(*) as n FROM merch_orders WHERE color = ?")
    .bind(color)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

// Called from the Stripe webhook on checkout.session.completed for a hat
// product. INSERT OR IGNORE on session_id means a redelivered webhook event
// for the same session is a harmless no-op instead of a duplicate order.
export async function createMerchOrder(
  env: DbEnv,
  opts: {
    sessionId: string;
    color: string;
    email: string;
    name?: string;
    shippingName?: string;
    shippingAddress?: string;
    amountTotal?: number;
  }
): Promise<void> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO merch_orders (id, session_id, color, email, name, shipping_name, shipping_address, amount_total, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      opts.sessionId,
      opts.color,
      opts.email,
      opts.name || null,
      opts.shippingName || null,
      opts.shippingAddress || null,
      opts.amountTotal ?? null,
      new Date().toISOString()
    )
    .run();
}

export async function createInquiry(
  env: DbEnv,
  opts: { memberEmail: string; memberName?: string; question: string }
): Promise<Inquiry> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO inquiries (id, member_email, member_name, question, status, created_at) VALUES (?, ?, ?, ?, 'new', ?)`
  )
    .bind(id, opts.memberEmail, opts.memberName || null, opts.question, now)
    .run();
  return (await env.DB.prepare("SELECT * FROM inquiries WHERE id = ?").bind(id).first<Inquiry>())!;
}
