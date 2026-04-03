/**
 * Clipboard utilities — iOS bplist-safe writes.
 *
 * On iOS 16+, UIPasteboard.general.string auto-detects URL strings and
 * stores them as public.url (binary plist) alongside public.utf8-plain-text.
 * Some paste targets (iMessage) read the URL type and display raw bplist bytes.
 *
 * Fix: use expo-clipboard's HTML input format whose native setter calls
 * UIPasteboard.setItems() with explicit UTTypes (utf8PlainText, html, rtf)
 * — no URL auto-detection.
 */

import * as Clipboard from "expo-clipboard";
import { Platform } from "react-native";

/** Copy text to clipboard without iOS bplist URL encoding. */
export async function copyPlainText(text: string): Promise<boolean> {
  if (Platform.OS !== "ios") {
    return Clipboard.setStringAsync(text);
  }
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return Clipboard.setStringAsync(`<span>${escaped}</span>`, {
    inputFormat: Clipboard.StringFormat.HTML,
  });
}
