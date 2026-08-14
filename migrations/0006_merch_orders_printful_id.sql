-- Adds printful_order_id to merch_orders so /api/printful-webhook.ts (which
-- receives Printful's package_shipped event) can look back from a shipped
-- Printful order to the buyer's email/name/items and send a real
-- Dudela-branded tracking email — before this column existed, there was no
-- way to connect "this Printful order just shipped" back to "this is who
-- bought it," so the receipt email's "we'll email you the second it's on
-- its way" line wasn't actually backed by any code.
--
-- Nullable: existing rows (orders placed before this column existed) will
-- have NULL here and just won't get a tracking email, which is correct —
-- there's no reliable way to backfill it after the fact.
--
-- Apply with: wrangler d1 execute dudela --remote --file=./migrations/0006_merch_orders_printful_id.sql

ALTER TABLE merch_orders ADD COLUMN printful_order_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_merch_orders_printful_order_id ON merch_orders(printful_order_id);
