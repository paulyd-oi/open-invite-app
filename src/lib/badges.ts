export type BadgePillVariant = "default" | "og" | "pro" | "gift";

/** @deprecated Use getBadgePillVariantForBadge for badgeKey-aware mapping. */
export function getBadgePillVariant(badgeName?: string | null): BadgePillVariant {
  return getBadgePillVariantForBadge({ badgeKey: undefined, name: badgeName ?? undefined });
}

/** PRO trio badge keys — kept in sync with badgesApi.PRO_TRIO_BADGE_KEYS */
const PRO_TRIO_KEYS = new Set(["pro_includer", "pro_initiator", "pro_organizer"]);

/**
 * [P0_BADGE_PALETTE] SSOT: map badge identity to BadgePill variant.
 * Prefers badgeKey when available, falls back to name.
 */
export function getBadgePillVariantForBadge(
  badge: { badgeKey?: string; name?: string } | null | undefined,
): BadgePillVariant {
  if (!badge) return "default";
  const key = (badge.badgeKey ?? "").trim().toLowerCase();
  if (key && PRO_TRIO_KEYS.has(key)) return "pro";
  if (key === "og") return "og";
  // Fallback to name when badgeKey unavailable
  const nm = (badge.name ?? "").trim().toUpperCase();
  if (nm === "OG") return "og";
  return "default";
}

export type FeaturedBadgePill = {
  badgeKey: string;
  name: string;
  tierColor: string;
};

export function normalizeFeaturedBadge(badge: any): FeaturedBadgePill | null {
  if (!badge) return null;

  const name = typeof badge?.name === "string" ? badge.name : "";
  if (!name) return null;

  const badgeKey = typeof badge?.badgeKey === "string" ? badge.badgeKey : "";
  const tierColor =
    (typeof badge?.tierColor === "string" && badge.tierColor) ? badge.tierColor : "#F59E0B";

  return { badgeKey, name, tierColor };
}
