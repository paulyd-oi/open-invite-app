#!/bin/bash
set -euo pipefail

# Cross-platform sed in-place (macOS vs Linux)
sedi() {
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "$@"
  else
    sed -i "$@"
  fi
}

# --- Patch expo-image: remove AVIF dependency ---
PODSPEC="node_modules/expo-image/ios/ExpoImage.podspec"
if [ -f "$PODSPEC" ]; then
  sedi "/SDWebImageAVIFCoder/d" "$PODSPEC"
  sedi "/libavif/d" "$PODSPEC"
  echo ">>> Patched expo-image podspec: removed AVIF dependencies"
else
  echo ">>> Warning: expo-image podspec not found at $PODSPEC"
fi

IMAGE_MODULE="node_modules/expo-image/ios/ImageModule.swift"
if [ -f "$IMAGE_MODULE" ]; then
  sedi "/import SDWebImageAVIFCoder/d" "$IMAGE_MODULE"
  sedi "/SDImageAVIFCoder/d" "$IMAGE_MODULE"
  echo ">>> Patched ImageModule.swift: removed AVIF import and usage"
else
  echo ">>> Warning: ImageModule.swift not found at $IMAGE_MODULE"
fi
