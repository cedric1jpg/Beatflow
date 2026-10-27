#!/bin/bash
# Run this ONCE to create a Beatflow.app on your Desktop

APP_NAME="Beatflow"
APP_DIR="$HOME/Desktop/$APP_NAME.app"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$APP_DIR/Contents/MacOS"
mkdir -p "$APP_DIR/Contents/Resources"

# App launcher script (no terminal window)
cat > "$APP_DIR/Contents/MacOS/$APP_NAME" <<'APPEOF'
#!/bin/bash
cd "$(dirname "$0")"/../../../
lsof -ti:3000 | xargs kill -9 2>/dev/null
node server/index.js &
for i in $(seq 1 20); do
  curl -s http://localhost:3000/health > /dev/null 2>&1 && break
  sleep 0.5
done
open http://localhost:3000
APPEOF

chmod +x "$APP_DIR/Contents/MacOS/$APP_NAME"

# Info.plist
cat > "$APP_DIR/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>Beatflow</string>
  <key>CFBundleDisplayName</key>
  <string>Beatflow</string>
  <key>CFBundleIdentifier</key>
  <string>com.beatflow.app</string>
  <key>CFBundleVersion</key>
  <string>1.0</string>
  <key>CFBundleExecutable</key>
  <string>Beatflow</string>
  <key>LSUIElement</key>
  <true/>
</dict>
</plist>
PLIST

echo "✓ Beatflow.app created on your Desktop."
echo "  Double-click it to launch Beatflow anytime."
