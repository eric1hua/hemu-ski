#!/bin/zsh
# Double-click launcher: starts the dev server (if it isn't already running)
# and opens the game in the default browser. Close this window to stop it.
# ${0:A} resolves symlinks, so a shortcut to this file works from anywhere.
# HEMU_PAGE opens another page on the same server instead (Hemu Map
# Editor.command sets it to the map editor).
cd "${0:A:h}/.." || exit 1
PORT=5190
URL="http://localhost:$PORT/"
PAGE="$URL${HEMU_PAGE:-}"

[ -d node_modules ] || npm install || { read -k1 "?npm install failed. Press any key to close."; exit 1; }

if lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  open "$PAGE"
  exit 0
fi

npx vite --port $PORT --strictPort &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT INT TERM HUP
for i in {1..100}; do
  curl -s -o /dev/null "$URL" && break
  sleep 0.2
done
open "$PAGE"
echo "\nHemu Ski is running at $URL  (diorama: ${URL}diorama.html, map editor: ${URL}tools/map-editor/)"
echo "Close this window to stop the server."
wait $SERVER
