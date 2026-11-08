#!/bin/bash
# Builds build/Caleido.app and build/Caleido-<version>.dmg (universal: Apple Silicon + Intel).
# Usage: macos/build.sh
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./package.json').version")
OUT=build
APP="$OUT/Caleido.app"
TMP="$OUT/tmp"
rm -rf "$APP" "$TMP" "$OUT"/Caleido-*.dmg
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" "$TMP"

universal() {   # universal <minimum macOS> <output> <swift files...>
  local min=$1 out=$2; shift 2
  for arch in arm64 x86_64; do
    swiftc -O -target "$arch-apple-macos$min" "$@" -o "$TMP/$(basename "$out").$arch" 2>&1 | grep -v "warning:" || true
  done
  lipo -create "$TMP/$(basename "$out")".{arm64,x86_64} -output "$out"
}

echo "• compiling app"
universal 13.0 "$APP/Contents/MacOS/Caleido" macos/main.swift
echo "• compiling helpers"
universal 13.0 "$APP/Contents/Resources/recognize" scripts/recognize.swift
# system audio capture needs macOS 14.2: on older systems the helper doesn't start and the app stays on the mic
universal 14.2 "$APP/Contents/Resources/sysaudio" scripts/sysaudio.swift

echo "• resources"
sed "s/__VERSION__/$VERSION/g" macos/Info.plist > "$APP/Contents/Info.plist"
cp -R app "$APP/Contents/Resources/app"
cp macos/Caleido.icns "$APP/Contents/Resources/Caleido.icns"

echo "• signing (ad hoc)"
codesign --force --sign - "$APP/Contents/Resources/recognize"
codesign --force --sign - "$APP/Contents/Resources/sysaudio"
codesign --force --sign - "$APP"

echo "• disk image"
mkdir -p "$TMP/dmg"
cp -R "$APP" "$TMP/dmg/"
ln -s /Applications "$TMP/dmg/Applications"
hdiutil create -quiet -volname "Caleido" -srcfolder "$TMP/dmg" -ov -format UDZO "$OUT/Caleido-$VERSION.dmg"
rm -rf "$TMP"

echo "Done: $APP and $OUT/Caleido-$VERSION.dmg"
