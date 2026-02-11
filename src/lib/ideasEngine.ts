/**
 * ideasEngine.ts — Deterministic idea-card generation for the Suggestions/Ideas screen.
 *
 * Pure functions only. No hooks, no AsyncStorage, no UI imports.
 * Card generation rules operate on pre-fetched data passed as IdeasContext.
 *
 * SSOT for: IdeaCard, IdeaCategory, IdeasContext, generateIdeas()
 */

import { devLog } from "@/lib/devLog";
import {
  type IdeaArchetype,
  type ScoreBreakdown,
  scoreIdea,
  diversityMerge as archetypeDiversityMerge,
  localEntropySort,
  buildDailySeed,
} from "@/lib/ideaScoring";

// ─── Types ───────────────────────────────────────────────

export type IdeaCategory =
  | "reconnect"
  | "activity_repeat"
  | "low_rsvp"
  | "birthday"
  | "timing";

export interface IdeaCard {
  id: string;
  category: IdeaCategory;

  friendId?: string;
  circleId?: string;
  eventId?: string;

  title: string;
  subtitle: string;

  /** Pre-filled draft for the chat composer (never auto-sent). */
  draftMessage: string;

  /** Higher = more relevant. Used for sort. */
  score: number;

  // ── Optional media (derived from already-available data) ──
  friendAvatarUrl?: string | null;
  eventPhotoUrl?: string | null;
  eventTitle?: string;
  /** Short context chips, max 2. Shown only when data exists. */
  contextChips?: string[];
  /** Archetype classification for scoring pipeline. */
  archetype?: IdeaArchetype;
  /** Structured score breakdown (debug metadata). */
  scoreBreakdown?: ScoreBreakdown;
}

// ─── Context (caller collects from existing queries) ─────

export interface IdeasFriend {
  id: string;
  name: string | null;
}

export interface IdeasEvent {
  id: string;
  title: string;
  hostId: string;
  hostName: string | null;
  startTime: string; // ISO
  goingCount?: number;
  capacity?: number | null;
  hostAvatarUrl?: string | null;
  eventPhotoUrl?: string | null;
}

export interface IdeasMyEvent {
  title: string;
  startTime: string; // ISO
}

export interface IdeasBirthday {
  friendId: string;
  friendName: string | null;
  birthday: string; // ISO date
  avatarUrl?: string | null;
}

export interface IdeasReconnect {
  friendId: string;
  friendName: string | null;
  daysSinceHangout: number;
  avatarUrl?: string | null;
}

export interface IdeasContext {
  reconnects: IdeasReconnect[];
  birthdays: IdeasBirthday[];
  upcomingFriendEvents: IdeasEvent[];
  myRecentEvents: IdeasMyEvent[];
}

// ─── Helpers ─────────────────────────────────────────────

function firstName(name: string | null | undefined): string {
  if (!name) return "a friend";
  return name.split(" ")[0] || name;
}

export function getTodayKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ─── Recency decay (pure scoring adjustment) ─────────────

/** Map of ideaId → ISO timestamp string of last shown date. */
export type ExposureMap = Record<string, string>;

/**
 * Apply recency decay penalties to card scores.
 * shownToday → -60% of score, shownYesterday → -30%.
 * Pure function — does not mutate input cards.
 */
export function applyRecencyDecay(
  cards: IdeaCard[],
  exposures: ExposureMap,
  todayKey: string,
): IdeaCard[] {
  const todayMs = new Date(todayKey).getTime();
  const oneDayMs = 86_400_000;

  return cards.map((card) => {
    const lastShown = exposures[card.id];
    if (!lastShown) return card;

    const shownMs = new Date(lastShown).getTime();
    const daysDiff = (todayMs - shownMs) / oneDayMs;

    let penalty = 0;
    if (daysDiff < 1) penalty = -0.6; // shown today
    else if (daysDiff < 2) penalty = -0.3; // shown yesterday

    if (penalty === 0) return card;

    return { ...card, score: card.score * (1 + penalty) };
  });
}

/**
 * Build updated exposure map after deck generation.
 * Sets today's date for all cards in the new deck.
 */
export function updateExposureMap(
  existing: ExposureMap,
  deckIds: string[],
  todayKey: string,
): ExposureMap {
  const updated = { ...existing };
  // Prune entries older than 3 days to keep storage small
  const todayMs = new Date(todayKey).getTime();
  for (const [id, ts] of Object.entries(updated)) {
    if (todayMs - new Date(ts).getTime() > 3 * 86_400_000) {
      delete updated[id];
    }
  }
  // Mark current deck
  for (const id of deckIds) {
    updated[id] = todayKey;
  }
  return updated;
}

// ─── Learning model (pure scoring adjustment) ───────────

/** Per-category accept/dismiss stats for learning bias. */
export type AcceptStats = Record<string, { accepted: number; dismissed: number }>;

/**
 * Bias card scores toward categories the user accepts more often.
 * rate = accepted / total  →  affinity = rate − 0.5
 * adjustedScore = baseScore × clamp(1 + affinity, 0.75, 1.25)
 *
 * Requires ≥ 5 total swipes on a category before applying bias.
 * Pure function — does not mutate input cards.
 */
export function applyLearningBias(
  cards: IdeaCard[],
  stats: AcceptStats,
): IdeaCard[] {
  return cards.map((card) => {
    const s = stats[card.category];
    if (!s) return card;
    const total = s.accepted + s.dismissed;
    if (total < 5) return card; // not enough data
    const rate = s.accepted / total;
    const affinity = rate - 0.5; // range: -0.5 to +0.5
    const multiplier = Math.max(0.75, Math.min(1.25, 1 + affinity));
    return { ...card, score: card.score * multiplier };
  });
}

/**
 * Record a swipe action into accept stats.
 * Returns a new AcceptStats object (immutable).
 */
export function recordSwipeAction(
  stats: AcceptStats,
  category: string,
  action: "accepted" | "dismissed",
): AcceptStats {
  const current = stats[category] ?? { accepted: 0, dismissed: 0 };
  return {
    ...stats,
    [category]: {
      accepted: current.accepted + (action === "accepted" ? 1 : 0),
      dismissed: current.dismissed + (action === "dismissed" ? 1 : 0),
    },
  };
}

/**
 * Monthly reset: if lastResetMonth differs from current month, return fresh stats.
 */
export function maybeResetStats(
  stats: AcceptStats,
  lastResetMonth: string | null,
): { stats: AcceptStats; resetMonth: string } {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (lastResetMonth === currentMonth) {
    return { stats, resetMonth: currentMonth };
  }
  return { stats: {}, resetMonth: currentMonth };
}

// ─── Context boosts (time/social scoring) ────────────────

/**
 * Apply lightweight time & social context scoring boosts.
 * - Friday evening → +0.2 to activity_repeat cards ("weekend plan" energy)
 * - Sunday → +0.15 to reconnect cards (reflective/plan-ahead)
 * - Birthday within 3 days → +0.25 to that friend's birthday card
 *
 * Additive boost capped at +0.3 per card.
 * Pure function — does not mutate input cards.
 */
export function applyContextBoosts(
  cards: IdeaCard[],
  birthdayMap?: Record<string, number>, // friendId → daysUntilBirthday
): IdeaCard[] {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 5=Fri, 6=Sat
  const hour = now.getHours();
  const isFridayEvening = dayOfWeek === 5 && hour >= 16;
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isSunday = dayOfWeek === 0;

  return cards.map((card) => {
    let boost = 0;

    // Friday evening: boost repeat activities (weekend plans)
    if (isFridayEvening && card.category === "activity_repeat") {
      boost += 0.2;
    }

    // Weekend: slight boost to low_rsvp (go do something!)
    if (isWeekend && card.category === "low_rsvp") {
      boost += 0.1;
    }

    // Sunday: boost reconnect (reflective day)
    if (isSunday && card.category === "reconnect") {
      boost += 0.15;
    }

    // Birthday proximity: boost birthday cards within 3 days
    if (card.category === "birthday" && card.friendId && birthdayMap) {
      const daysUntil = birthdayMap[card.friendId];
      if (daysUntil != null && daysUntil <= 3) {
        boost += 0.25;
      }
    }

    // Cap total boost at +0.3
    boost = Math.min(boost, 0.3);
    if (boost === 0) return card;

    return { ...card, score: card.score * (1 + boost) };
  });
}

// ─── Rule A: Reconnect ──────────────────────────────────

function ruleReconnect(
  reconnects: IdeasReconnect[],
  todayKey: string,
): IdeaCard[] {
  const cards: IdeaCard[] = [];
  for (const r of reconnects) {
    if (r.daysSinceHangout < 14) continue;
    const name = firstName(r.friendName);
    const chips: string[] = [];
    if (r.daysSinceHangout >= 14) chips.push(`${r.daysSinceHangout}d since last hangout`);
    cards.push({
      id: `reconnect_${r.friendId}_${todayKey}`,
      category: "reconnect",
      archetype: "reconnect",
      friendId: r.friendId,
      title: `Catch up with ${name}?`,
      subtitle: "It's been a while — plan something easy.",
      draftMessage: "Hey! Want to catch up soon?",
      score: Math.min(85, 50 + r.daysSinceHangout / 7),
      friendAvatarUrl: r.avatarUrl,
      contextChips: chips.length > 0 ? chips.slice(0, 2) : undefined,
    });
  }
  return cards;
}

// ─── Rule B: Low RSVP event ─────────────────────────────

function ruleLowRsvp(
  events: IdeasEvent[],
  todayKey: string,
): IdeaCard[] {
  const cards: IdeaCard[] = [];
  const todayMs = new Date(todayKey).getTime();

  for (const ev of events) {
    const evMs = new Date(ev.startTime).getTime();
    const diffDays = (evMs - todayMs) / (1000 * 60 * 60 * 24);
    if (diffDays < 0 || diffDays > 7) continue;

    const going = ev.goingCount ?? 0;
    const isLow =
      going < 2 ||
      (ev.capacity != null && ev.capacity > 0 && going < ev.capacity / 2);
    if (!isLow) continue;

    const host = firstName(ev.hostName);
    const chips: string[] = [];
    if (going > 0) chips.push(`${going} going`);
    if (diffDays <= 1) chips.push("Tomorrow");
    else if (diffDays <= 3) chips.push(`In ${Math.ceil(diffDays)} days`);
    cards.push({
      id: `low_rsvp_${ev.id}_${todayKey}`,
      category: "low_rsvp",
      archetype: "join_event",
      eventId: ev.id,
      friendId: ev.hostId,
      title: `Join ${host}'s ${ev.title}?`,
      subtitle: "They could use company.",
      draftMessage: `I'm thinking about joining your ${ev.title} — save me a spot?`,
      score: 90 - diffDays * 5,
      friendAvatarUrl: ev.hostAvatarUrl,
      eventPhotoUrl: ev.eventPhotoUrl,
      eventTitle: ev.title,
      contextChips: chips.length > 0 ? chips.slice(0, 2) : undefined,
    });
  }
  return cards;
}

// ─── Rule C: Birthday soon ──────────────────────────────

function ruleBirthday(
  birthdays: IdeasBirthday[],
  todayKey: string,
): IdeaCard[] {
  const cards: IdeaCard[] = [];
  const today = new Date(todayKey);
  const thisYear = today.getFullYear();

  for (const b of birthdays) {
    if (!b.birthday) continue;
    const bDate = new Date(b.birthday);
    if (isNaN(bDate.getTime())) continue;

    const thisYearBday = new Date(thisYear, bDate.getMonth(), bDate.getDate());
    const diffMs = thisYearBday.getTime() - today.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffDays < 0 || diffDays > 21) continue;

    const name = firstName(b.friendName);
    const chips: string[] = [];
    if (diffDays <= 1) chips.push("Tomorrow!");
    else if (diffDays <= 7) chips.push(`In ${Math.ceil(diffDays)} days`);
    else chips.push(`In ${Math.ceil(diffDays)} days`);
    cards.push({
      id: `birthday_${b.friendId}_${todayKey}`,
      category: "birthday",
      archetype: "birthday",
      friendId: b.friendId,
      title: `${name}'s birthday is coming up`,
      subtitle: "Plan something fun?",
      draftMessage: `Your birthday is coming up! Want to plan something?`,
      score: 95 - diffDays * 2,
      friendAvatarUrl: b.avatarUrl,
      contextChips: chips.length > 0 ? chips.slice(0, 2) : undefined,
    });
  }
  return cards;
}

// ─── Rule D: Activity repeat ────────────────────────────

function ruleActivityRepeat(
  myEvents: IdeasMyEvent[],
  todayKey: string,
): IdeaCard[] {
  const cards: IdeaCard[] = [];
  const todayMs = new Date(todayKey).getTime();

  const titleMap = new Map<string, { title: string; lastDate: string }>();
  for (const ev of myEvents) {
    const key = ev.title.toLowerCase().trim();
    if (!key) continue;
    const existing = titleMap.get(key);
    if (
      !existing ||
      new Date(ev.startTime).getTime() > new Date(existing.lastDate).getTime()
    ) {
      titleMap.set(key, { title: ev.title, lastDate: ev.startTime });
    }
  }

  for (const [, { title, lastDate }] of titleMap) {
    const diffDays =
      (todayMs - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays < 7 || diffDays > 30) continue;

    cards.push({
      id: `repeat_${title.toLowerCase().replace(/\s+/g, "_")}_${todayKey}`,
      category: "activity_repeat",
      archetype: "repeat_activity",
      title: `Do ${title} again this week?`,
      subtitle: "You've done this before.",
      draftMessage: `Want to do ${title} again this week?`,
      score: 60,
    });
  }
  return cards;
}

// ─── Habit engine (pattern detection + reinforcement) ────

/**
 * Pattern memory: tracks accepted idea patterns for habit reinforcement.
 * Key format: "friendId:category" or "activity:title_slug"
 * Value: array of ISO timestamps (last accepted dates).
 */
export type PatternMemory = Record<string, string[]>;

/**
 * Record an accepted idea into pattern memory.
 * Keeps last 5 timestamps per pattern key.
 * Returns new PatternMemory (immutable).
 */
export function recordPattern(
  memory: PatternMemory,
  card: IdeaCard,
  todayKey: string,
): PatternMemory {
  const keys: string[] = [];
  if (card.friendId) {
    keys.push(`${card.friendId}:${card.category}`);
  }
  if (card.category === "activity_repeat") {
    const slug = card.title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    keys.push(`activity:${slug}`);
  }

  const updated = { ...memory };
  for (const key of keys) {
    const existing = updated[key] ?? [];
    updated[key] = [...existing, todayKey].slice(-5); // keep last 5
  }
  return updated;
}

/**
 * Prune pattern memory entries older than 60 days.
 */
export function prunePatternMemory(
  memory: PatternMemory,
  todayKey: string,
): PatternMemory {
  const todayMs = new Date(todayKey).getTime();
  const cutoff = 60 * 86_400_000; // 60 days
  const pruned: PatternMemory = {};
  for (const [key, timestamps] of Object.entries(memory)) {
    const recent = timestamps.filter(
      (ts) => todayMs - new Date(ts).getTime() < cutoff,
    );
    if (recent.length > 0) pruned[key] = recent;
  }
  return pruned;
}

/**
 * Apply habit-based boosts from pattern memory.
 * - If user accepted same friend:category ≥2 times → +0.15 boost
 * - If friend not interacted with for ≥5 days but has pattern history → +0.1 reconnect boost
 * Pure function.
 */
export function applyHabitBoosts(
  cards: IdeaCard[],
  memory: PatternMemory,
  todayKey: string,
): IdeaCard[] {
  if (Object.keys(memory).length === 0) return cards;
  const todayMs = new Date(todayKey).getTime();
  const fiveDaysMs = 5 * 86_400_000;

  return cards.map((card) => {
    let boost = 0;

    // Check friend:category pattern
    if (card.friendId) {
      const key = `${card.friendId}:${card.category}`;
      const history = memory[key];
      if (history && history.length >= 2) {
        boost += 0.15; // repeat pattern detected
      }

      // Reconnect boost: friend has pattern history but last accept was >5 days ago
      if (card.category === "reconnect" && history && history.length > 0) {
        const lastAccept = new Date(history[history.length - 1]!).getTime();
        if (todayMs - lastAccept > fiveDaysMs) {
          boost += 0.1;
        }
      }
    }

    // Activity repeat pattern boost
    if (card.category === "activity_repeat") {
      const slug = card.title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      const history = memory[`activity:${slug}`];
      if (history && history.length >= 2) {
        boost += 0.15;
      }
    }

    boost = Math.min(boost, 0.25); // cap
    if (boost === 0) return card;
    return { ...card, score: card.score * (1 + boost) };
  });
}

/**
 * Compute adaptive deck size based on engagement.
 * High engagement (many accepts relative to total) → up to 12 cards.
 * Low engagement → 6-8 cards.
 * Default: 10.
 */
export function adaptiveDeckSize(acceptStats?: AcceptStats): number {
  if (!acceptStats) return 10;
  let totalAccepts = 0;
  let totalSwipes = 0;
  for (const s of Object.values(acceptStats)) {
    totalAccepts += s.accepted;
    totalSwipes += s.accepted + s.dismissed;
  }
  if (totalSwipes < 10) return 10; // not enough data
  const rate = totalAccepts / totalSwipes;
  if (rate >= 0.5) return 12; // high engagement
  if (rate <= 0.2) return 7; // low engagement
  return 10;
}

// ─── Ranking + dedup + category diversity ────────────────

const DEFAULT_MAX_CARDS = 10;

/** Dedup by friend (1 card per friend, low_rsvp keyed by event). */
function dedup(cards: IdeaCard[]): IdeaCard[] {
  const sorted = [...cards].sort((a, b) => b.score - a.score);
  const seenFriends = new Set<string>();
  const result: IdeaCard[] = [];

  for (const card of sorted) {
    if (card.category === "low_rsvp") {
      result.push(card);
      if (card.friendId) seenFriends.add(card.friendId);
      continue;
    }
    if (!card.friendId) {
      result.push(card);
      continue;
    }
    if (seenFriends.has(card.friendId)) continue;
    seenFriends.add(card.friendId);
    result.push(card);
  }

  return result;
}

/**
 * Round-robin merge: buckets by category, picks highest-scoring card
 * from a category not used in the last 2 slots.
 * Hard constraint: max 2 consecutive same-category cards.
 * Deterministic for identical inputs.
 */
function diversityMerge(cards: IdeaCard[], maxCards: number = DEFAULT_MAX_CARDS): IdeaCard[] {
  // Bucket cards by category, preserving score order within each bucket
  const buckets = new Map<IdeaCategory, IdeaCard[]>();
  for (const card of cards) {
    const existing = buckets.get(card.category);
    if (existing) {
      existing.push(card);
    } else {
      buckets.set(card.category, [card]);
    }
  }

  const result: IdeaCard[] = [];
  const recent: IdeaCategory[] = []; // track last 2 categories

  while (result.length < maxCards) {
    let picked = false;

    // Find best available card from a category not in last 2
    let bestCard: IdeaCard | null = null;
    let bestCategory: IdeaCategory | null = null;

    for (const [cat, bucket] of buckets) {
      if (bucket.length === 0) continue;
      // Skip if this category was used in both of the last 2 slots
      const recentCount = recent.filter((r) => r === cat).length;
      if (recentCount >= 2) continue;
      if (!bestCard || bucket[0]!.score > bestCard.score) {
        bestCard = bucket[0]!;
        bestCategory = cat;
      }
    }

    if (bestCard && bestCategory) {
      result.push(bestCard);
      buckets.get(bestCategory)!.shift();
      recent.push(bestCategory);
      if (recent.length > 2) recent.shift();
      picked = true;
    }

    if (!picked) {
      // All remaining cards are from blocked categories — relax constraint
      // Pick the highest-scoring card from any non-empty bucket
      let fallback: IdeaCard | null = null;
      let fallbackCat: IdeaCategory | null = null;
      for (const [cat, bucket] of buckets) {
        if (bucket.length === 0) continue;
        if (!fallback || bucket[0]!.score > fallback.score) {
          fallback = bucket[0]!;
          fallbackCat = cat;
        }
      }
      if (fallback && fallbackCat) {
        result.push(fallback);
        buckets.get(fallbackCat)!.shift();
        recent.push(fallbackCat);
        if (recent.length > 2) recent.shift();
      } else {
        break; // no cards left
      }
    }
  }

  return result;
}

function rankAndDedupe(cards: IdeaCard[], maxCards?: number): IdeaCard[] {
  const deduped = dedup(cards);
  return diversityMerge(deduped, maxCards);
}

// ─── Engine entry point ──────────────────────────────────

export function generateIdeas(
  context: IdeasContext,
  exposures?: ExposureMap,
  acceptStats?: AcceptStats,
  birthdayMap?: Record<string, number>,
  patternMemory?: PatternMemory,
  viewerUserId?: string,
): IdeaCard[] {
  const todayKey = getTodayKey();

  const ruleACards = ruleReconnect(context.reconnects, todayKey);
  const ruleBCards = ruleLowRsvp(context.upcomingFriendEvents, todayKey);
  const ruleCCards = ruleBirthday(context.birthdays, todayKey);
  const ruleDCards = ruleActivityRepeat(context.myRecentEvents, todayKey);

  if (__DEV__) {
    devLog(
      `[P1_IDEAS_ENGINE] inputs: reconnects=${context.reconnects.length} birthdays=${context.birthdays.length} friendEvents=${context.upcomingFriendEvents.length} myEvents=${context.myRecentEvents.length}`,
    );
    devLog(
      `[P1_IDEAS_ENGINE] cards per rule: A_reconnect=${ruleACards.length} B_lowRsvp=${ruleBCards.length} C_birthday=${ruleCCards.length} D_repeat=${ruleDCards.length}`,
    );
  }

  let allCards = [...ruleACards, ...ruleBCards, ...ruleCCards, ...ruleDCards];

  // P1_SCORE: snapshot baseline scores for breakdown
  const _baseScores = new Map(allCards.map(c => [c.id, c.score]));

  // Apply recency decay if exposure data available
  if (exposures && Object.keys(exposures).length > 0) {
    allCards = applyRecencyDecay(allCards, exposures, todayKey);
    if (__DEV__) {
      devLog(`[P2_RECENCY_DECAY] applied decay from ${Object.keys(exposures).length} exposures`);
    }
  }
  const _postDecayScores = new Map(allCards.map(c => [c.id, c.score]));

  // Apply learning bias if accept stats available
  if (acceptStats && Object.keys(acceptStats).length > 0) {
    allCards = applyLearningBias(allCards, acceptStats);
    if (__DEV__) {
      devLog(`[P2_LEARNING_MODEL] applied bias from ${Object.keys(acceptStats).length} categories`);
    }
  }
  const _postLearnScores = new Map(allCards.map(c => [c.id, c.score]));

  // Apply context boosts (time-of-day, day-of-week, birthday proximity)
  allCards = applyContextBoosts(allCards, birthdayMap);
  if (__DEV__) {
    devLog(`[P2_CONTEXT_BOOSTS] applied time/social context boosts`);
  }
  const _postCtxScores = new Map(allCards.map(c => [c.id, c.score]));

  // Apply habit reinforcement boosts from pattern memory
  if (patternMemory && Object.keys(patternMemory).length > 0) {
    allCards = applyHabitBoosts(allCards, patternMemory, todayKey);
    if (__DEV__) {
      devLog(`[P2_HABIT_ENGINE] applied habit boosts from ${Object.keys(patternMemory).length} patterns`);
    }
  }

  // P1_SCORE: compute and attach structured score breakdowns
  for (const card of allCards) {
    if (!card.archetype) continue;
    const base = _baseScores.get(card.id) ?? card.score;
    const postDecay = _postDecayScores.get(card.id) ?? base;
    const postLearn = _postLearnScores.get(card.id) ?? postDecay;
    const postCtx = _postCtxScores.get(card.id) ?? postLearn;
    const final = card.score;

    card.scoreBreakdown = scoreIdea({
      archetype: card.archetype,
      baseOverride: base,
      recencyPenalty: Math.max(0, base - postDecay),
      contextBoost: postCtx - postLearn,
      habitBoost: (postLearn - postDecay) + (final - postCtx),
    });

    if (__DEV__) {
      devLog(`[P1_SCORE] ${card.id}`, card.scoreBreakdown);
    }
  }

  // P2B_SEEDED_ENTROPY: deterministic per-user per-day shuffle within score buckets
  const _entropyUserId = viewerUserId || "anonymous";
  allCards = localEntropySort(allCards, _entropyUserId);
  if (__DEV__) {
    devLog("[P2B_SEEDED_ENTROPY]", {
      seed: buildDailySeed(_entropyUserId),
      cardCount: allCards.length,
    });
  }

  // P2_DIVERSITY: interleave archetypes
  allCards = archetypeDiversityMerge(allCards);
  if (__DEV__) {
    devLog(
      "[P2_DIVERSITY]",
      allCards.map((i) => ({ archetype: i.archetype, score: i.scoreBreakdown?.final })),
    );
  }

  // Adaptive deck size based on engagement
  const deckSize = adaptiveDeckSize(acceptStats);
  const deck = rankAndDedupe(allCards, deckSize);

  if (__DEV__) {
    devLog(`[P1_IDEAS_ENGINE] final deck size: ${deck.length}`);
  }

  return deck;
}
