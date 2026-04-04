#!/bin/bash
set -euo pipefail

# Patch expo-image to remove AVIF dependency (SDWebImageAVIFCoder not available on EAS)
PODSPEC="node_modules/expo-image/ios/ExpoImage.podspec"
if [ -f "$PODSPEC" ]; then
  sed -i '' "/SDWebImageAVIFCoder/d" "$PODSPEC" 2>/dev/null || sed -i "/SDWebImageAVIFCoder/d" "$PODSPEC"
  sed -i '' "/libavif/d" "$PODSPEC" 2>/dev/null || sed -i "/libavif/d" "$PODSPEC"
  echo "Patched expo-image podspec: removed AVIF dependencies"
else
  echo "Warning: expo-image podspec not found at $PODSPEC"
fi

# Also patch the Swift source to remove the AVIF import and usage
IMAGE_MODULE="node_modules/expo-image/ios/ImageModule.swift"
if [ -f "$IMAGE_MODULE" ]; then
  sed -i '' "/import SDWebImageAVIFCoder/d" "$IMAGE_MODULE" 2>/dev/null || sed -i "/import SDWebImageAVIFCoder/d" "$IMAGE_MODULE"
  sed -i '' "/SDImageAVIFCoder/d" "$IMAGE_MODULE" 2>/dev/null || sed -i "/SDImageAVIFCoder/d" "$IMAGE_MODULE"
  echo "Patched ImageModule.swift: removed AVIF import and usage"
else
  echo "Warning: ImageModule.swift not found at $IMAGE_MODULE"
fi

# Force wholemodule compilation on lottie-ios pod
# lottie-ios 4.6.0 has Sources/Private vs Sources/Public module visibility bug
# on Xcode 16.x (iPhoneOS18.5.sdk). wholemodule compilation resolves it.
for config in ios/Pods/Target\ Support\ Files/lottie-ios/lottie-ios.*.xcconfig; do
  if [ -f "$config" ]; then
    if ! grep -q 'SWIFT_COMPILATION_MODE' "$config"; then
      echo "SWIFT_COMPILATION_MODE = wholemodule" >> "$config"
      echo "Patched lottie-ios xcconfig (appended): $config"
    else
      sed -i '' 's/SWIFT_COMPILATION_MODE = .*/SWIFT_COMPILATION_MODE = wholemodule/' "$config" 2>/dev/null || \
      sed -i 's/SWIFT_COMPILATION_MODE = .*/SWIFT_COMPILATION_MODE = wholemodule/' "$config"
      echo "Patched lottie-ios xcconfig (updated): $config"
    fi
  fi
done
