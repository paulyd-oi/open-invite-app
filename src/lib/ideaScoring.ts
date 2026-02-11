/**
 * ideaScoring.ts — Archetype-based scoring layer for Ideas.
 *
 * Pure functions only. Provides structured score breakdowns
 * for debug visibility into the scoring pipeline.
 *
 * SSOT for: IdeaArchetype, ScoreBreakdown, scoreIdea()
 */

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
 * Soft-randomize ideas whose scores are within `threshold` of each other.
 * Adds controlled entropy so near-equal ideas don't always appear in the
 * same order, without disrupting clearly dominant cards.
 * Pure function — returns a new sorted array.
 */
export function localEntropySort<
  T extends { scoreBreakdown?: { final: number } },
>(ideas: T[], threshold = 5): T[] {
  return [...ideas].sort((a, b) => {
    const diff =
      (b.scoreBreakdown?.final ?? 0) - (a.scoreBreakdown?.final ?? 0);
    if (Math.abs(diff) < threshold) {
      return Math.random() - 0.5;
    }
    return diff;
  });
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
