#!/bin/sh
# Render public/og.png - the 1200x630 card that Discord, X and Slack show when
# someone pastes the link. Re-run after changing the title or the sample balls.
#
# Uses headless Chrome because it is already on the machine; any browser that
# can screenshot at a fixed window size would do.
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
TMP=$(mktemp -d)

# point the card at this checkout's sprites
sed "s|ICONS|file://$(printf %s "$ROOT" | sed 's/ /%20/g')/public/icons|g" \
  "$ROOT/scripts/og-card.html" > "$TMP/og.html"

"$CHROME" --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
  --allow-file-access-from-files \
  --screenshot="$TMP/og.png" --window-size=1200,630 "file://$TMP/og.html" >/dev/null 2>&1

cp "$TMP/og.png" "$ROOT/public/og.png"
rm -rf "$TMP"
echo "wrote public/og.png ($(du -h "$ROOT/public/og.png" | cut -f1))"
