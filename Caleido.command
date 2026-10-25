#!/bin/bash
# Caleido: double-click to start the visualizer on the TV (external display).
cd "$(dirname "$0")"
PORT=8765
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE="$HOME/Library/Application Support/Caleido-Chrome"

# local server (unless already running)
if ! curl -s -o /dev/null "http://localhost:$PORT/"; then
  node server.js &
  SERVER=$!
  trap 'kill $SERVER 2>/dev/null' EXIT
  for i in {1..20}; do curl -s -o /dev/null "http://localhost:$PORT/" && break; sleep 0.2; done
fi

read X Y W H N <<< "$(osascript -l JavaScript scripts/screens.js)"
if [ "$N" -gt 1 ]; then echo "External display found: ${W}x${H} at $X,$Y"
else echo "No external display: using the Mac screen (connect the TV and run again)"; fi

# keep the display awake while the visualizer is open
caffeinate -dis -w $$ &

# Dedicated Chrome (separate profile), fullscreen on the chosen display.
# --use-fake-ui-for-media-stream grants the microphone without a prompt (for this local page only).
"$CHROME" --user-data-dir="$PROFILE" --no-first-run --no-default-browser-check \
  --app="http://localhost:$PORT/" --window-position="$X,$Y" --window-size="$W,$H" \
  --kiosk --autoplay-policy=no-user-gesture-required --use-fake-ui-for-media-stream \
  --disable-features=Translate --disable-session-crashed-bubble --noerrdialogs "$@"
