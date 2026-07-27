-- "Perceived community" feed for the member area — not a live forum/feed,
-- just a lightweight, one-per-member card: first name, city, what stage of
-- fatherhood they're in, and one thing they've learned. Rendered as a
-- floating bubble cloud on /member/community.
-- Apply with: wrangler d1 execute dudela --remote --file=./migrations/0003_community_notes.sql

CREATE TABLE IF NOT EXISTS community_notes (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL UNIQUE REFERENCES members(id),
  first_name TEXT NOT NULL,
  city TEXT,
  dad_stage TEXT,
  advice TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_community_notes_created_at ON community_notes(created_at DESC);
