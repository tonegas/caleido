#!/bin/bash
# Regenerates macos/Caleido.icns from a frame of the Mandala scene.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP=$(mktemp -d)
node macos/render-icon.mjs "$TMP/frame.png"
swift macos/icon-mask.swift "$TMP/frame.png" "$TMP/icon.png"
mkdir "$TMP/Caleido.iconset"
for s in 16 32 128 256 512; do
  sips -z $s $s "$TMP/icon.png" --out "$TMP/Caleido.iconset/icon_${s}x${s}.png" >/dev/null
  sips -z $((s * 2)) $((s * 2)) "$TMP/icon.png" --out "$TMP/Caleido.iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$TMP/Caleido.iconset" -o macos/Caleido.icns
cp "$TMP/icon.png" docs/icon.png
rm -rf "$TMP"
echo "macos/Caleido.icns updated"
