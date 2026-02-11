/**
 * smartMicrocopy.ts — Deterministic daily microcopy SSOT for Ideas deck.
 *
 * Pure functions only. No React imports.
 * Uses seeded PRNG for deterministic per-day copy selection.
 *
 * SSOT for: getCompletionCopy, getAcceptFeedback,
 *           getDismissFeedback, getDeckHint
 */

// ─── Seeded entropy helpers (copied from ideaScoring.ts,
//     which keeps them private) ───────────────────────────

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

// ─── Core helper ─────────────────────────────────────────

/**
 * Deterministically pick one item from a pool.
 * Same (seed + salt) always returns the same index.
 */
export function pickFromPool<T>(seed: number, salt: string, pool: T[]): T {
  if (pool.length === 0) throw new Error("pickFromPool: empty pool");
  const combined = hashStringToSeed(`${seed}_${salt}`);
  const rng = mulberry32(combined);
  const idx = Math.floor(rng() * pool.length);
  return pool[idx]!;
}

// ─── Completion copy ─────────────────────────────────────

export interface CompletionCopyInput {
  seed: number;
  acceptedCount: number;
  dismissedCount: number;
  totalCount: number;
}

export interface CompletionCopy {
  title: string;
  subtitle: string;
  hint?: string;
}

const COMPLETION_TITLES = [
  "You\u2019re set for today",
  "Nice \u2014 that\u2019s today\u2019s ideas",
  "All caught up",
  "That\u2019s today\u2019s spark",
];

export function getCompletionCopy(input: CompletionCopyInput): CompletionCopy {
  const { seed, acceptedCount, dismissedCount, totalCount } = input;

  const title = pickFromPool(seed, "title", COMPLETION_TITLES);

  let subtitle: string;
  if (acceptedCount >= 1) {
    subtitle = "You\u2019ve got plans brewing. Come back tomorrow for more.";
  } else if (dismissedCount === totalCount && totalCount > 0) {
    subtitle = "Nothing clicked today \u2014 tomorrow might.";
  } else {
    subtitle = "Fresh ideas arrive daily.";
  }

  return { title, subtitle };
}

// ─── Accept feedback ─────────────────────────────────────

export interface AcceptFeedbackInput {
  seed: number;
  archetype?: string;
  category?: string;
}

const ACCEPT_POOLS: Record<string, string[]> = {
  reconnect: [
    "Nice \u2014 reconnects matter.",
    "Good move \u2014 stay close.",
  ],
  join_event: [
    "Good call \u2014 shared plans stick.",
    "Events are better with friends.",
  ],
  repeat_activity: [
    "Consistency builds rituals.",
    "Routines make friendships last.",
  ],
  birthday: [
    "Good catch \u2014 birthdays land.",
    "They\u2019ll appreciate it.",
  ],
};

const ACCEPT_FALLBACK = ["Nice choice.", "Good pick."];

export function getAcceptFeedback(input: AcceptFeedbackInput): string | null {
  const { seed, archetype, category } = input;
  const key = archetype ?? category ?? "fallback";
  const pool = ACCEPT_POOLS[key] ?? ACCEPT_FALLBACK;
  return pickFromPool(seed, `accept_${key}`, pool);
}

/**
 * Deterministic accept-feedback throttle.
 * First accept in a session (n === 1) always returns true.
 * Subsequent accepts return true ~50% of the time, seeded.
 */
export function shouldShowAcceptFeedback(
  seed: number,
  n: number,
): boolean {
  if (n <= 1) return true;
  const salt = `accept_throttle_${n}`;
  const combined = hashStringToSeed(`${seed}_${salt}`);
  const rng = mulberry32(combined);
  return rng() < 0.5;
}

// ─── Dismiss feedback (rare: 1-in-6) ────────────────────

export interface DismissFeedbackInput {
  seed: number;
  archetype?: string;
  category?: string;
  index?: number;
}

const DISMISS_POOL = [
  "Not every idea needs to stick.",
  "All good \u2014 keep browsing.",
  "Next one might fit better.",
];

export function getDismissFeedback(input: DismissFeedbackInput): string | null {
  const { seed, archetype, index } = input;
  const salt = `dismiss_${archetype ?? "x"}_${index ?? 0}`;
  const combined = hashStringToSeed(`${seed}_${salt}`);
  const rng = mulberry32(combined);
  // ~1-in-6 chance to fire
  if (rng() > 1 / 6) return null;
  return pickFromPool(seed, salt, DISMISS_POOL);
}

// ─── Deck hint ───────────────────────────────────────────

export interface DeckHintInput {
  seed: number;
}

const DECK_HINTS = [
  "Daily ideas adapt to you",
  "These shift with your rhythm",
  "Fresh signals tomorrow",
];

export function getDeckHint(input: DeckHintInput): string {
  return pickFromPool(input.seed, "deckHint", DECK_HINTS);
}
