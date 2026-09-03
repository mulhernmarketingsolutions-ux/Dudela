#!/bin/bash
cd "$(dirname "$0")"
npx wrangler r2 object put dudela-womb-watch/ww-week5-audio.mp3 --file="Womb Watch Audios/WW 1.mp3"
npx wrangler r2 object put dudela-womb-watch/ww-week8-audio.mp3 --file="Womb Watch Audios/WW 2.mp3"
npx wrangler r2 object put dudela-womb-watch/ww-week13-audio.mp3 --file="Womb Watch Audios/WW 3.mp3"
npx wrangler r2 object put dudela-womb-watch/ww-week16-audio.mp3 --file="Womb Watch Audios/WW 4.mp3"
npx wrangler r2 object put dudela-womb-watch/ww-week20-audio.mp3 --file="Womb Watch Audios/WW 5.mp3"
echo "ALL 5 UPLOADS COMPLETE"
