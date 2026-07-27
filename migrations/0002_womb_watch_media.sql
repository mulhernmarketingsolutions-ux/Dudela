-- Adds video-episode support to posts, for Womb Watch mini-episodes (short
-- podcast-interview-style clips with Mike about the pregnancy, week by
-- week). Nullable so plain-text posts in other categories are unaffected.
-- Apply with: wrangler d1 execute dudela --remote --file=./migrations/0002_womb_watch_media.sql

ALTER TABLE posts ADD COLUMN video_url TEXT;
ALTER TABLE posts ADD COLUMN thumbnail_url TEXT;
ALTER TABLE posts ADD COLUMN week_label TEXT;
