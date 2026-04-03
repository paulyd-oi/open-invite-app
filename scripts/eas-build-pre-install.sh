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

# Pin lottie-ios to 4.4.3 — 4.5.0 breaks EAS Xcode builds
LOTTIE_PODSPEC="node_modules/lottie-react-native/lottie-react-native.podspec"
if [ -f "$LOTTIE_PODSPEC" ]; then
  sed -i '' "s/s.dependency 'lottie-ios', '4.5.0'/s.dependency 'lottie-ios', '4.4.3'/" "$LOTTIE_PODSPEC" 2>/dev/null || \
  sed -i "s/s.dependency 'lottie-ios', '4.5.0'/s.dependency 'lottie-ios', '4.4.3'/" "$LOTTIE_PODSPEC"
  echo "Patched lottie-react-native podspec: pinned lottie-ios to 4.4.3"
else
  echo "Warning: lottie-react-native podspec not found at $LOTTIE_PODSPEC"
fi
