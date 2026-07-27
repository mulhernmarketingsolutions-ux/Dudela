-- Merch presale orders (Dudela Hat — 3 colorways, $38 each, one-time payment).
-- Not linked to the members table — buyers don't need to be Spit-Up Society
-- members to buy a hat, and the free-month-of-Society perk was dropped for
-- this presale. session_id is UNIQUE so the Stripe webhook can safely retry
-- without double-inserting if Stripe redelivers the same event.
-- color count against a hard cap of 10 per colorway is how /merch and the
-- checkout route enforce the presale's scarcity.
-- Apply with: wrangler d1 execute dudela --remote --file=./migrations/0004_merch_orders.sql

CREATE TABLE IF NOT EXISTS merch_orders (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  shipping_name TEXT,
  shipping_address TEXT,
  amount_total INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_merch_orders_color ON merch_orders(color);
