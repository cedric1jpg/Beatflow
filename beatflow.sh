#!/bin/bash
cd "$(dirname "$0")"

# Kill existing instance
fuser -k 3000/tcp 2>/dev/null

echo "Starting Beatflow..."
node server/index.js &
SERVER_PID=$!

for i in $(seq 1 20); do
  curl -s http://localhost:3000/health > /dev/null 2>&1 && break
  sleep 0.5
done

# Open browser (try common openers)
xdg-open http://localhost:3000 2>/dev/null \
  || gnome-open http://localhost:3000 2>/dev/null \
  || sensible-browser http://localhost:3000 2>/dev/null

echo "Beatflow running. Ctrl+C to stop."
wait $SERVER_PID
