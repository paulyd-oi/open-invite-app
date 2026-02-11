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
