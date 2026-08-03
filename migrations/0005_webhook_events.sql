-- Idempotency guard for the Stripe webhook. Stripe redelivers the *same*
-- event id on automatic retries, and "Resend" in the Stripe dashboard also
-- redelivers the identical event id — but the webhook handler had no way to
-- tell "first delivery" from "redelivery" before sending real emails. Result:
-- every redelivery re-sent the customer's purchase receipt AND the internal
-- admin notification email, unguarded. (Discovered 2026-07-31 after manually
-- resending the same checkout.session.completed event ~7x while debugging
-- the Printful order-confirmation retry logic — each resend re-fired both
-- emails for real.)
--
-- event_id is Stripe's event.id (evt_...), which stays constant across
-- redeliveries of the same event — unlike session.id, this also covers
-- customer.subscription.deleted events, not just checkout sessions.
--
-- Deliberately NOT used to gate Printful order creation or the merch_orders
-- insert — those are separately idempotent (external_id dedup lookup /
-- INSERT OR IGNORE on session_id) and SHOULD keep retrying on redelivery,
-- since that's what makes a previously-failed Printful confirmation
-- recoverable via a Stripe resend.
--
-- Apply with: wrangler d1 execute dudela --remote --file=./migrations/0005_webhook_events.sql

CREATE TABLE IF NOT EXISTS processed_webhook_events (
  event_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
