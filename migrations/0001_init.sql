-- Dudela member area — initial schema.
-- Apply with: wrangler d1 execute dudela --remote --file=./migrations/0001_init.sql
-- (after creating the D1 database — see wrangler.toml for the full setup note)

-- One row per member (currently: Spit-Up Society subscribers). Created by the
-- Stripe webhook on checkout.session.completed, updated to status='canceled'
-- on customer.subscription.deleted. This is what magic-link login checks
-- against, and what the gated dashboard reads for name/status/Stripe IDs.
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  product TEXT NOT NULL DEFAULT 'spit-up-society',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_members_stripe_customer ON members(stripe_customer_id);

-- Single-use, short-lived (20 min) login tokens emailed to members. Burned
-- (used_at set) the moment they're clicked, whether or not verification
-- succeeds against a member record.
CREATE TABLE IF NOT EXISTS magic_links (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 30-day cookie-backed sessions created once a magic link is verified.
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Separate, simpler session table for the Womb Watch posting UI — a single
-- shared password (ADMIN_PASSWORD secret), not per-person member accounts.
CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Womb Watch updates (and any future member-only content — `category` leaves
-- room for that without a schema change).
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'womb-watch',
  published_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_posts_published_at ON posts(published_at DESC);

-- Questions members submit ahead of the live Q&A (or any time) via the gated
-- "Ask a Question" form. status lets John/Mike mark ones they've covered.
CREATE TABLE IF NOT EXISTS inquiries (
  id TEXT PRIMARY KEY,
  member_email TEXT NOT NULL,
  member_name TEXT,
  question TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
