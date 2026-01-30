export type FeaturedBadgePill = {
  name: string;
  tierColor: string;
};

export function normalizeFeaturedBadge(badge: any): FeaturedBadgePill | null {
  if (!badge) return null;

  const name = typeof badge?.name === "string" ? badge.name : "";
  if (!name) return null;

  const tierColor =
    (typeof badge?.tierColor === "string" && badge.tierColor) ? badge.tierColor : "#F59E0B";

  return { name, tierColor };
}
