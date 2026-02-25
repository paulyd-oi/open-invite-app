/**
 * [P1_FONTS_SSOT] Single Source of Truth for all app fonts.
 *
 * Every font used in onboarding, login, and the main app shell is declared
 * here so _layout.tsx can gate first paint on a single `useFonts(APP_FONTS)`.
 *
 * To add a font:
 *   1. Import the weight from its @expo-google-fonts package.
 *   2. Add it to APP_FONTS below.
 *   3. Reference by name string (e.g. "Sora_700Bold") in StyleSheet.
 *
 * DO NOT load fonts anywhere else — _layout.tsx is the sole call-site.
 */
import {
  Sora_300Light,
  Sora_400Regular,
  Sora_500Medium,
  Sora_600SemiBold,
  Sora_700Bold,
} from "@expo-google-fonts/sora";

/**
 * Master font map passed to `useFonts()` in _layout.tsx.
 * Keys are the fontFamily strings used in StyleSheets.
 */
export const APP_FONTS = {
  Sora_300Light,
  Sora_400Regular,
  Sora_500Medium,
  Sora_600SemiBold,
  Sora_700Bold,
} as const;
