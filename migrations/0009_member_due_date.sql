-- Adds an optional due date to members, collected on the free Spit-Up Society
-- signup (Oct 2026). Powers the week-by-week "Your Week, In Your Inbox" emails.
-- Format: YYYY-MM-DD. Nullable.
-- Apply with: wrangler d1 execute dudela --remote --file=./migrations/0009_member_due_date.sql

ALTER TABLE members ADD COLUMN due_date TEXT;
