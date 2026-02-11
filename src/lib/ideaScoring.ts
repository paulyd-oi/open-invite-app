/**
 * ideaScoring.ts — Archetype-based scoring layer for Ideas.
 *
 * Pure functions only. Provides structured score breakdowns
 * for debug visibility into the scoring pipeline.
 *
 * SSOT for: IdeaArchetype, ScoreBreakdown, scoreIdea()
 */

// ─── Seeded entropy helpers ──────────────────────────────

function hashStringToSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mulberry32 — tiny deterministic PRNG. */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildDailySeed(userId: string): number {
  const now = new Date();
  const dayKey = `${now.getFullYear()}_${now.getMonth()}_${now.getDate()}`;
  return hashStringToSeed(`${userId}_${dayKey}`);
}

// ─── Types ───────────────────────────────────────────────

export type IdeaArchetype =
  | "reconnect"
  | "join_event"
  | "birthday"
  | "repeat_activity"
  | "explore"
  | "support_friend";

export type ScoreBreakdown = {
  base: number;
  context: number;
  habit: number;
  decay: number;
  final: number;
  /** Confidence 0.0–1.0 (populated by computeConfidence after pipeline). */
  confidence: number;
};

const ARCHETYPE_CONFIG: Record<IdeaArchetype, { base: number }> = {
  reconnect: { base: 60 },
  join_event: { base: 75 },
  birthday: { base: 95 },
  repeat_activity: { base: 65 },
  explore: { base: 55 },
  support_friend: { base: 70 },
};

/**
 * Compute a structured score breakdown for an idea.
 *
 * @param baseOverride — Use instead of archetype config base when
 *   the rule-computed score differs from the fixed archetype default.
 */
export function scoreIdea({
  archetype,
  baseOverride,
  recencyPenalty = 0,
  contextBoost = 0,
  habitBoost = 0,
}: {
  archetype: IdeaArchetype;
  baseOverride?: number;
  recencyPenalty?: number;
  contextBoost?: number;
  habitBoost?: number;
}): ScoreBreakdown {
  const base = baseOverride ?? ARCHETYPE_CONFIG[archetype].base;
  const final = base + contextBoost + habitBoost - recencyPenalty;

  return {
    base,
    context: contextBoost,
    habit: habitBoost,
    decay: recencyPenalty,
    final,
    confidence: 0, // populated by computeConfidence() after pipeline stages
  };
}

// ─── Diversity helpers ────────────────────────────────────

/**
 * Round-robin interleave by archetype.
 * Prevents archetype streaks in the final deck.
 * Pure function — does not mutate input array.
 */
export function diversityMerge<
  T extends { archetype?: string; scoreBreakdown?: { final: number } },
>(ideas: T[]): T[] {
  const buckets = new Map<string, T[]>();

  for (const i of ideas) {
    const key = i.archetype || "unknown";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(i);
  }

  // Sort inside each bucket by descending final score
  for (const list of buckets.values()) {
    list.sort(
      (a, b) => (b.scoreBreakdown?.final ?? 0) - (a.scoreBreakdown?.final ?? 0),
    );
  }

  const result: T[] = [];
  let remaining = true;
  while (remaining) {
    remaining = false;
    for (const bucket of buckets.values()) {
      if (bucket.length > 0) {
        result.push(bucket.shift()!);
        remaining = true;
      }
    }
  }

  return result;
}

/**
 * Deterministic soft-shuffle: groups cards into score buckets of width
 * WINDOW, then applies a seeded Fisher-Yates shuffle within each bucket.
 * Stable per user per day — same inputs always produce the same order.
 * Pure function — returns a new array.
 */
export function localEntropySort<
  T extends { scoreBreakdown?: { final: number } },
>(ideas: T[], userId: string): T[] {
  if (!ideas.length) return ideas;

  const seed = buildDailySeed(userId);
  const rng = mulberry32(seed);
  const WINDOW = 5;

  const groups: Record<number, T[]> = {};
  for (const card of ideas) {
    const score = card.scoreBreakdown?.final ?? 0;
    const bucket = Math.floor(score / WINDOW);
    if (!groups[bucket]) groups[bucket] = [];
    groups[bucket]!.push(card);
  }

  const sortedBuckets = Object.keys(groups)
    .map(Number)
    .sort((a, b) => b - a);

  const result: T[] = [];
  for (const bucket of sortedBuckets) {
    const arr = groups[bucket]!;
    // Seeded Fisher-Yates shuffle
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
    result.push(...arr);
  }

  return result;
}

// ─── Archetype spacing engine ─────────────────────────────

export interface ArchetypeSpacingOpts {
  /** Max consecutive cards of the same archetype (default 1). */
  maxConsecutive?: number;
  /** Candidate window size for greedy pick (default 5). */
  topK?: number;
}

export interface ArchetypeSpacingResult<T> {
  cards: T[];
  violationsCount: number;
}

/**
 * Greedy archetype-spaced selector.
 *
 * At each step, considers the top-K candidates by score and picks
 * the highest-scoring one whose archetype doesn't violate the
 * consecutive-cap. If all K violate, picks the best anyway (never
 * drops cards). Runs AFTER scoring & entropy, BEFORE final cap.
 *
 * Pure function — does not mutate input array.
 */
export function applyArchetypeSpacing<
  T extends { archetype?: string; scoreBreakdown?: { final: number } },
>(
  cards: T[],
  opts: ArchetypeSpacingOpts = {},
): ArchetypeSpacingResult<T> {
  const maxConsec = opts.maxConsecutive ?? 1;
  const topK = opts.topK ?? 5;

  if (cards.length <= 1) return { cards: [...cards], violationsCount: 0 };

  // Sort pool by score descending (stable copy)
  const pool = [...cards].sort(
    (a, b) => (b.scoreBreakdown?.final ?? 0) - (a.scoreBreakdown?.final ?? 0),
  );

  const result: T[] = [];
  const recentArchetypes: string[] = [];
  let violations = 0;

  while (pool.length > 0) {
    const window = pool.slice(0, Math.min(topK, pool.length));

    // Count consecutive tail of same archetype in result
    let tailArchetype: string | null = null;
    let tailCount = 0;
    for (let i = recentArchetypes.length - 1; i >= 0; i--) {
      if (tailArchetype === null) {
        tailArchetype = recentArchetypes[i]!;
        tailCount = 1;
      } else if (recentArchetypes[i] === tailArchetype) {
        tailCount++;
      } else {
        break;
      }
    }

    // Find best candidate that doesn't violate spacing
    let pickedIdx = -1;
    for (let i = 0; i < window.length; i++) {
      const arch = window[i]!.archetype || "unknown";
      if (arch !== tailArchetype || tailCount < maxConsec) {
        pickedIdx = i;
        break;
      }
    }

    // All K candidates violate — allow the violation, pick best
    if (pickedIdx === -1) {
      pickedIdx = 0;
      violations++;
    }

    const picked = pool.splice(pickedIdx, 1)[0]!;
    result.push(picked);
    recentArchetypes.push(picked.archetype || "unknown");
  }

  return { cards: result, violationsCount: violations };
}

// ─── Confidence scoring ─────────────────────────────────

const ARCHETYPE_BASE_CONFIDENCE: Record<IdeaArchetype, number> = {
  birthday: 0.85,
  join_event: 0.8,
  support_friend: 0.7,
  repeat_activity: 0.7,
  reconnect: 0.65,
  explore: 0.6,
};

/**
 * Pure confidence score 0.0–1.0 computed from breakdown + archetype.
 *
 * Factors:
 *  - Base confidence by archetype (reflects inherent relevance)
 *  - +0.05 if habit boost present (repeated engagement signal)
 *  - +0.05 if context boost present (time/day signal alignment)
 *  - -0.10 if significant decay (stale card)
 *  - Clamped to [0.35, 0.95]
 */
export function computeConfidence(
  archetype: IdeaArchetype,
  breakdown: Omit<ScoreBreakdown, "confidence">,
): number {
  let conf = ARCHETYPE_BASE_CONFIDENCE[archetype] ?? 0.6;

  if (breakdown.habit > 0) conf += 0.05;
  if (breakdown.context > 0) conf += 0.05;
  if (breakdown.decay > 5) conf -= 0.1;

  return Math.max(0.35, Math.min(0.95, conf));
}

export type ConfidenceLabel = "High match" | "Good match" | "Worth a try";

/** Map a numeric confidence to a human-friendly label. */
export function confidenceToLabel(confidence: number): ConfidenceLabel {
  if (confidence >= 0.85) return "High match";
  if (confidence >= 0.7) return "Good match";
  return "Worth a try";
}

// ─── Friend cooldown ─────────────────────────────────────

export interface FriendCooldownResult<T> {
  cards: T[];
  forcedCount: number;
}

/**
 * Best-effort reorder: avoid repeating the same friendId within
 * the last `windowSize` positions.  Cards with no friendId
 * (e.g. activity_repeat) are treated as always-unique and never
 * enter the cooldown window — this is the safer option because
 * event cards have no friend to collide with.
 *
 * Deterministic.  Never drops cards.  If no non-colliding
 * candidate exists in the remaining pool, the next card is
 * placed as-is and `forcedCount` increments.
 *
 * Runs AFTER archetype spacing, BEFORE final slice cap.
 * Pure function — does not mutate input array.
 */
export function applyFriendCooldown<T extends { friendId?: string }>(
  cards: T[],
  windowSize: number = 3,
): FriendCooldownResult<T> {
  if (cards.length <= 1) return { cards: [...cards], forcedCount: 0 };

  const pool = [...cards];
  const result: T[] = [];
  let forcedCount = 0;

  while (pool.length > 0) {
    // Collect friendIds in the recent window (only non-null entries)
    const recentFriends = new Set<string>();
    for (
      let i = Math.max(0, result.length - windowSize);
      i < result.length;
      i++
    ) {
      const fid = result[i]!.friendId;
      if (fid) recentFriends.add(fid);
    }

    // Find first pool card that doesn't collide
    let pickedIdx = -1;
    for (let i = 0; i < pool.length; i++) {
      const fid = pool[i]!.friendId;
      // No friendId → always OK (exempt from cooldown)
      if (!fid || !recentFriends.has(fid)) {
        pickedIdx = i;
        break;
      }
    }

    // No non-colliding candidate → forced pick (index 0)
    if (pickedIdx === -1) {
      pickedIdx = 0;
      forcedCount++;
    }

    result.push(pool.splice(pickedIdx, 1)[0]!);
  }

  return { cards: result, forcedCount };
}

// ─── Category mapping ────────────────────────────────────

/** Map category string → IdeaArchetype. */
export function categoryToArchetype(category: string): IdeaArchetype {
  switch (category) {
    case "reconnect":
      return "reconnect";
    case "low_rsvp":
      return "join_event";
    case "birthday":
      return "birthday";
    case "activity_repeat":
      return "repeat_activity";
    case "timing":
      return "explore";
    default:
      return "explore";
  }
}
