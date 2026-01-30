/**
 * Normalize a featured badge to ensure it always has required fields for rendering.
 * Provides default tierColor (#F59E0B gold) if missing.
 */
export function normalizeFeaturedBadge(badge: any): { name: string; tierColor: string } | null {
  if (!badge) return null;
  return {
    name: badge.name ?? "",
    tierColor: badge.tierColor ?? "#F59E0B",
  };
}
