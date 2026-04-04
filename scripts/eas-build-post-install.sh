#!/bin/bash
set -euo pipefail

# --- Patch expo-image: remove AVIF dependency (not available on EAS) ---
PODSPEC="node_modules/expo-image/ios/ExpoImage.podspec"
if [ -f "$PODSPEC" ]; then
  sed -i '' "/SDWebImageAVIFCoder/d" "$PODSPEC"
  sed -i '' "/libavif/d" "$PODSPEC"
  echo ">>> Patched expo-image podspec: removed AVIF dependencies"
else
  echo ">>> Warning: expo-image podspec not found at $PODSPEC"
fi

IMAGE_MODULE="node_modules/expo-image/ios/ImageModule.swift"
if [ -f "$IMAGE_MODULE" ]; then
  sed -i '' "/import SDWebImageAVIFCoder/d" "$IMAGE_MODULE"
  sed -i '' "/SDImageAVIFCoder/d" "$IMAGE_MODULE"
  echo ">>> Patched ImageModule.swift: removed AVIF import and usage"
else
  echo ">>> Warning: ImageModule.swift not found at $IMAGE_MODULE"
fi
