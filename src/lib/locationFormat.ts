/**
 * Extract a short location label (city or venue name) from a full address string.
 * Used on preview cards — full address remains on event detail pages.
 */
export function formatLocationShort(location: string | null | undefined): string {
  if (!location) return "";
  const trimmed = location.trim();

  // "Venue Name, 123 Street, City, CA 92101" → "City"
  // "Venue Name, City, State" → "City"
  // "City, State" → "City"
  const parts = trimmed.split(",").map((s) => s.trim());

  if (parts.length >= 3) {
    // Multi-part address: second-to-last is usually the city
    return parts[parts.length - 2];
  }
  if (parts.length === 2) {
    // "City, State" or "Venue, City" — return the first part
    return parts[0];
  }
  // Single value — return as-is
  return trimmed;
}
