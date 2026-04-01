/**
 * Soften a hex color by blending it toward white.
 *
 * Used for user-picked custom card colors which can be too saturated.
 * Theme-derived colors are NOT softened — only custom cardColor hex values.
 *
 * @param hex - 6-digit hex color (with or without #)
 * @param blend - blend factor toward white (0 = original, 1 = white). Default 0.4.
 * @returns softened hex color string with #
 */
export function softenColor(hex: string, blend = 0.4): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return hex;

  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);

  if (isNaN(r) || isNaN(g) || isNaN(b)) return hex;

  const sr = Math.round(r + (255 - r) * blend);
  const sg = Math.round(g + (255 - g) * blend);
  const sb = Math.round(b + (255 - b) * blend);

  return `#${sr.toString(16).padStart(2, "0")}${sg.toString(16).padStart(2, "0")}${sb.toString(16).padStart(2, "0")}`;
}
