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
