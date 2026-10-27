#!/bin/bash
# Beatflow Launcher — macOS
# Double-click this file in Finder to open Beatflow

# Navigate to the app directory (same folder as this script)
cd "$(dirname "$0")"

# Kill any existing instance on port 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null

# Start the Node.js server in the background
echo "Starting Beatflow..."
node server/index.js &
SERVER_PID=$!

# Wait for server to be ready (poll /health endpoint)
echo "Waiting for server..."
for i in $(seq 1 20); do
  if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "Server ready."
    break
  fi
  sleep 0.5
done

# Open in default browser
open http://localhost:3000

echo "Beatflow is running. Close this window to stop the server."

# Keep terminal open and server alive; Ctrl+C to stop
wait $SERVER_PID
