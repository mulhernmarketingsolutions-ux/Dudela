-- Adds audio-episode support to posts, for the Spit-Up Society-only podcast
-- feed: full-length audio versions of Womb Watch episodes, playable via a
-- Watch/Listen toggle on /member/womb-watch. Nullable — existing posts and
-- other categories are unaffected.
-- Apply with: wrangler d1 execute dudela --remote --file=./migrations/0008_womb_watch_audio.sql

ALTER TABLE posts ADD COLUMN audio_url TEXT;
