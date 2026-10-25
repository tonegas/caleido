#!/bin/bash
# Caleido: doppio click per avviare il visualizzatore sulla TV (schermo esterno).
cd "$(dirname "$0")"
PORT=8765
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE="$HOME/Library/Application Support/Caleido-Chrome"

# server locale (se non è già attivo)
if ! curl -s -o /dev/null "http://localhost:$PORT/"; then
  node server.js &
  SERVER=$!
  trap 'kill $SERVER 2>/dev/null' EXIT
  for i in {1..20}; do curl -s -o /dev/null "http://localhost:$PORT/" && break; sleep 0.2; done
fi

read X Y W H N <<< "$(osascript -l JavaScript scripts/screens.js)"
if [ "$N" -gt 1 ]; then echo "Schermo esterno trovato: ${W}x${H} in posizione $X,$Y"
else echo "Nessuno schermo esterno: uso lo schermo del Mac (collega la TV e rilancia)"; fi

# schermo sempre acceso finché il visualizzatore è aperto
caffeinate -dis -w $$ &

# Chrome dedicato (profilo separato) a schermo intero sullo schermo scelto.
# --use-fake-ui-for-media-stream concede il microfono senza popup (solo per questa pagina locale).
"$CHROME" --user-data-dir="$PROFILE" --no-first-run --no-default-browser-check \
  --app="http://localhost:$PORT/" --window-position="$X,$Y" --window-size="$W,$H" \
  --kiosk --autoplay-policy=no-user-gesture-required --use-fake-ui-for-media-stream \
  --disable-features=Translate --disable-session-crashed-bubble --noerrdialogs "$@"
