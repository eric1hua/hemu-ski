#!/bin/zsh
# Double-click launcher: starts the dev server (if it isn't already running)
# and opens the game in the default browser. Close this window to stop it.
# ${0:A} resolves symlinks, so a shortcut to this file works from anywhere.
cd "${0:A:h}/.." || exit 1
PORT=5190
URL="http://localhost:$PORT/"

[ -d node_modules ] || npm install || { read -k1 "?npm install failed. Press any key to close."; exit 1; }

if lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  open "$URL"
  exit 0
fi

npx vite --port $PORT --strictPort &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT INT TERM HUP
for i in {1..100}; do
  curl -s -o /dev/null "$URL" && break
  sleep 0.2
done
open "$URL"
echo "\nHemu Ski is running at $URL  (diorama: ${URL}diorama.html)"
echo "Close this window to stop the server."
wait $SERVER
