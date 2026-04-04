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

# --- Patch lottie-ios: force wholemodule compilation ---
# lottie-ios 4.6.0 Sources/Private cannot resolve Sources/Public types
# on Xcode 16.4 (iPhoneOS18.5.sdk). Wholemodule compilation forces
# single-unit compilation which resolves the module visibility bug.
echo ">>> Applying lottie-ios wholemodule compilation fix..."
PATCHED=0
for config in ios/Pods/Target\ Support\ Files/lottie-ios/lottie-ios.*.xcconfig; do
  if [ -f "$config" ]; then
    if ! grep -q 'SWIFT_COMPILATION_MODE' "$config"; then
      echo "SWIFT_COMPILATION_MODE = wholemodule" >> "$config"
      echo ">>>   Appended wholemodule to: $config"
    else
      sed -i '' 's/SWIFT_COMPILATION_MODE = .*/SWIFT_COMPILATION_MODE = wholemodule/' "$config"
      echo ">>>   Updated wholemodule in: $config"
    fi
    PATCHED=$((PATCHED + 1))
  fi
done
if [ "$PATCHED" -eq 0 ]; then
  echo ">>> Warning: no lottie-ios xcconfig files found to patch"
else
  echo ">>> Patched $PATCHED lottie-ios xcconfig file(s)"
fi
