export type BadgePillVariant = "default" | "og" | "pro" | "gift";

/** Map a badge display-name to the correct BadgePill solid-surface variant. */
export function getBadgePillVariant(badgeName?: string | null): BadgePillVariant {
  const key = (badgeName ?? "").trim().toUpperCase();
  if (key === "OG") return "og";
  return "default";
}

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
