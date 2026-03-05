/**
 * Smart Discussion Prompts — SSOT V1
 *
 * Deterministic, keyword-inferred conversation starters for event discussion.
 * Same event always yields the same 3 prompts (no Math.random).
 *
 * Tag: [DISCUSS_PROMPTS]
 */

// ── Types ────────────────────────────────────────────────────────────
export type DiscussionPrompt = { id: string; text: string };

export interface DiscussionPromptInput {
  eventId?: string | number;
  title?: string;
  description?: string;
  locationName?: string;
  locationAddress?: string;
  startAt?: string | Date | number;
  endAt?: string | Date | number;
  isHost?: boolean;
  visibility?: string;
}

// ── Stable hash (djb2) ──────────────────────────────────────────────
function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0; // hash * 33 + c
  }
  return hash >>> 0; // unsigned
}

// ── Tag system ──────────────────────────────────────────────────────
export type EventTag =
  | "beach"
  | "hike"
  | "gym"
  | "food"
  | "party"
  | "study"
  | "sports"
  | "nightlife"
  | "online"
  | "volleyball"
  | "outdoor";

type TimeBucket = "morning" | "afternoon" | "evening" | "late" | null;

const TAG_KEYWORDS: Record<EventTag, string[]> = {
  beach: ["beach", "sand", "mission beach", "pacific beach", "la jolla", "surf", "shore", "ocean", "boardwalk"],
  volleyball: ["volley", "volleyball"],
  hike: ["hike", "hiking", "trail", "summit", "canyon", "peak", "backpack"],
  gym: ["gym", "lift", "workout", "run", "training", "crossfit", "yoga", "pilates", "spin"],
  food: ["dinner", "lunch", "brunch", "coffee", "cafe", "restaurant", "tacos", "pizza", "bbq", "cookout", "potluck", "picnic", "grill", "sushi", "ramen", "breakfast"],
  party: ["party", "birthday", "celebration", "kickback", "hangout", "mixer", "fiesta"],
  study: ["bible", "study", "prayer", "church", "worship", "fellowship", "devotional", "book club"],
  sports: ["soccer", "basketball", "tennis", "pickleball", "golf", "softball", "football", "frisbee", "flag football"],
  nightlife: ["bar", "club", "drinks", "happy hour", "brewery", "pub", "lounge", "cocktail"],
  online: ["zoom", "google meet", "online", "virtual", "teams", "discord", "remote", "webinar"],
  outdoor: ["park", "lake", "camping", "bonfire", "kayak", "paddleboard", "fishing"],
};

export function inferEventTags(
  title?: string,
  locationName?: string,
  description?: string,
): EventTag[] {
  const blob = [title, locationName, description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!blob) return [];

  const tags: EventTag[] = [];
  for (const [tag, keywords] of Object.entries(TAG_KEYWORDS) as [EventTag, string[]][]) {
    if (keywords.some((kw) => blob.includes(kw))) {
      tags.push(tag);
    }
  }
  return tags;
}

function inferTimeBucket(startAt?: string | Date | number): TimeBucket {
  if (!startAt) return null;
  const d = new Date(startAt);
  if (isNaN(d.getTime())) return null;
  const h = d.getHours();
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 22) return "evening";
  return "late";
}

// ── Prompt buckets ──────────────────────────────────────────────────
// Each bucket is an array of variants. The hash picks one deterministically.

const FOOD_PROMPTS = [
  "What should everyone bring? 🍽️",
  "Who's bringing what? 🥗",
  "Should we split the bill or go separate? 💰",
  "Any dietary restrictions to know about? 🌱",
];

const OUTDOOR_PROMPTS = [
  "Don't forget water and sunscreen! ☀️",
  "What gear should I bring? 🎒",
  "Should we bring extra chairs or towels? 🏖️",
  "Any equipment we need? 🧗",
];

const PARKING_PROMPTS = [
  "Where should we park? 🅿️",
  "Any tips on where to meet up when we get there? 📍",
  "Is parking easy or should we plan ahead? 🚗",
];

const CARPOOL_PROMPTS = [
  "Anyone want to carpool? 🚗",
  "Anyone need a ride? 🚙",
  "Should we coordinate rides? 🗺️",
];

const TIME_MORNING_PROMPTS = [
  "What time should we actually meet up? ⏰",
  "Should we grab coffee first? ☕",
  "Meet a bit early to settle in? 🌅",
];

const TIME_AFTERNOON_PROMPTS = [
  "Should we meet a little early? ⏰",
  "What time should we actually get there? 📍",
  "Anyone want to grab food before? 🍔",
];

const TIME_EVENING_PROMPTS = [
  "Should we catch the sunset? 🌇",
  "What time should we head over? ⏰",
  "Dinner before or after? 🍕",
];

const TIME_LATE_PROMPTS = [
  "What time are we actually heading out? 🌙",
  "Late night plans after? ✨",
  "What's the move after this? 🎶",
];

const PARTY_PROMPTS = [
  "What's the dress code? 👗",
  "Should I bring anything? 🎁",
  "What's the vibe? 🎉",
  "Any surprises planned? 🤫",
];

const NIGHTLIFE_PROMPTS = [
  "What's the dress code? 👔",
  "Any drink specials we should know about? 🍹",
  "Should we get a table or just wing it? 🎶",
];

const STUDY_PROMPTS = [
  "What are we covering this time? 📖",
  "Should I read anything beforehand? 📚",
  "Any materials to bring? ✏️",
];

const SPORTS_PROMPTS = [
  "How many people do we need? 🏅",
  "What equipment should I bring? 🎾",
  "Any skill level requirement? 💪",
];

const GYM_PROMPTS = [
  "What's the workout plan? 💪",
  "Any warm-up before we start? 🏋️",
  "Should we set a meeting spot at the gym? 📍",
];

const ONLINE_PROMPTS = [
  "Can someone share the meeting link? 💻",
  "Any agenda or topics to prep? 📝",
  "Camera on or off? 🎥",
];

const GENERIC_PROMPTS = [
  "Where should we meet when we get there? 📍",
  "Anything I should bring? 🎒",
  "Anyone want to carpool? 🚗",
  "What's everyone looking forward to? 😊",
  "Running late, start without me? ⏰",
];

// ── Deterministic picker ────────────────────────────────────────────
function pickVariant<T>(variants: T[], hash: number, offset: number): T {
  return variants[((hash + offset) >>> 0) % variants.length]!;
}

// ── Main export ─────────────────────────────────────────────────────
export function getDiscussionPrompts(input: DiscussionPromptInput): DiscussionPrompt[] {
  const {
    eventId,
    title,
    description,
    locationName,
    locationAddress,
    startAt,
  } = input;

  const tags = inferEventTags(title, locationName, description);
  const timeBucket = inferTimeBucket(startAt);
  const hasLocation = !!(locationName || locationAddress);
  const isOnline = tags.includes("online");

  // Stable seed from event identity
  const seed = djb2(
    String(eventId ?? "") + (title ?? "") + (locationName ?? "") + String(startAt ?? ""),
  );

  // Build candidate pool in priority order
  const candidates: string[] = [];

  // Tag-specific prompts (highest priority)
  if (tags.includes("food")) candidates.push(pickVariant(FOOD_PROMPTS, seed, 0));
  if (tags.includes("beach") || tags.includes("hike") || tags.includes("outdoor"))
    candidates.push(pickVariant(OUTDOOR_PROMPTS, seed, 1));
  if (tags.includes("volleyball") || tags.includes("sports"))
    candidates.push(pickVariant(SPORTS_PROMPTS, seed, 2));
  if (tags.includes("party")) candidates.push(pickVariant(PARTY_PROMPTS, seed, 3));
  if (tags.includes("nightlife")) candidates.push(pickVariant(NIGHTLIFE_PROMPTS, seed, 4));
  if (tags.includes("study")) candidates.push(pickVariant(STUDY_PROMPTS, seed, 5));
  if (tags.includes("gym")) candidates.push(pickVariant(GYM_PROMPTS, seed, 6));
  if (isOnline) candidates.push(pickVariant(ONLINE_PROMPTS, seed, 7));

  // Location-aware prompts (skip for online events)
  if (hasLocation && !isOnline) {
    candidates.push(pickVariant(PARKING_PROMPTS, seed, 8));
    candidates.push(pickVariant(CARPOOL_PROMPTS, seed, 9));
  }

  // Time-of-day prompts
  if (timeBucket === "morning") candidates.push(pickVariant(TIME_MORNING_PROMPTS, seed, 10));
  else if (timeBucket === "afternoon") candidates.push(pickVariant(TIME_AFTERNOON_PROMPTS, seed, 10));
  else if (timeBucket === "evening") candidates.push(pickVariant(TIME_EVENING_PROMPTS, seed, 10));
  else if (timeBucket === "late") candidates.push(pickVariant(TIME_LATE_PROMPTS, seed, 10));

  // Deduplicate while preserving order
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const c of candidates) {
    if (!seen.has(c)) {
      seen.add(c);
      unique.push(c);
    }
  }

  // Take first 3, pad with generics if needed
  // Skip location/carpool generics for online events
  const safeGenerics = isOnline
    ? GENERIC_PROMPTS.filter((g) => !g.includes("meet when") && !g.includes("carpool"))
    : GENERIC_PROMPTS;

  const result: string[] = unique.slice(0, 3);
  if (result.length < 3) {
    for (const g of safeGenerics) {
      if (result.length >= 3) break;
      if (!seen.has(g)) {
        seen.add(g);
        result.push(g);
      }
    }
  }

  return result.map((text, i) => ({
    id: `dp_${(seed + i) >>> 0}`,
    text,
  }));
}
