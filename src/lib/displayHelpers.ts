/**
 * Display helper functions for cleaning up UI strings
 */

/**
 * Clean up legacy group names for display
 * Removes "LEGACY GROUP" text that may appear in old database records
 * Returns cleaned name or default fallback
 */
export function cleanGroupName(name: string | undefined | null): string {
  if (!name) return "Unnamed Group";
  
  // Remove various "LEGACY" patterns (case-insensitive)
  const cleaned = name
    .replace(/LEGACY GROUP/gi, "")
    .replace(/Legacy Group/g, "")
    .replace(/legacy group/g, "")
    .replace(/\(LEGACY\)/gi, "")
    .replace(/\[LEGACY\]/gi, "")
    .trim();
  
  // If cleaning removed everything, return a default
  if (cleaned.length === 0) {
    if (__DEV__) {
      console.log("[DEV_DECISION] legacy_group_text_removed name_was_only_legacy=true original=" + JSON.stringify(name));
    }
    return "Group";
  }
  
  if (__DEV__ && cleaned !== name) {
    console.log("[DEV_DECISION] legacy_group_text_removed count=1 original=" + JSON.stringify(name) + " cleaned=" + JSON.stringify(cleaned));
  }
  
  return cleaned;
}
