#!/bin/bash
# Patch expo-image podspec to remove AVIF dependency
PODSPEC="node_modules/expo-image/ios/ExpoImage.podspec"
if [ -f "$PODSPEC" ]; then
  sed -i '' "/SDWebImageAVIFCoder/d" "$PODSPEC" 2>/dev/null || sed -i "/SDWebImageAVIFCoder/d" "$PODSPEC"
  sed -i '' "/libavif/d" "$PODSPEC" 2>/dev/null || sed -i "/libavif/d" "$PODSPEC"
  echo "Patched expo-image podspec: removed AVIF dependencies"
else
  echo "Warning: expo-image podspec not found at $PODSPEC"
fi
