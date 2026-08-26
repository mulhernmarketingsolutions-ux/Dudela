-- Reactions + comments for Womb Watch episodes. Two small tables rather than
-- one polymorphic "activity" table — reactions are toggled (unique per
-- member+post+kind) while comments append, and keeping them separate keeps
-- both queries trivial.
-- Apply with: wrangler d1 execute dudela --remote --file=./migrations/0007_womb_watch_interactions.sql

CREATE TABLE IF NOT EXISTS womb_watch_reactions (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id),
  member_id TEXT NOT NULL REFERENCES members(id),
  reaction TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(post_id, member_id, reaction)
);

CREATE INDEX IF NOT EXISTS idx_ww_reactions_post ON womb_watch_reactions(post_id);

CREATE TABLE IF NOT EXISTS womb_watch_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id),
  member_id TEXT NOT NULL REFERENCES members(id),
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ww_comments_post ON womb_watch_comments(post_id, created_at);
