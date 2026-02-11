/**
 * suggestionsDeck.ts — SSOT for Daily Ideas deck on the Suggestions screen.
 *
 * Pure functions only. No hooks, no side-effects, no network calls.
 * Card generation rules operate on pre-fetched data passed as DeckInput.
 * Deck resets daily (keyed by getTodayKey()).
 */

import { devLog } from "@/lib/devLog";

// ─── Types ───────────────────────────────────────────────

export type SuggestionCardKind =
  | "open_profile"
  | "open_event"
  | "create_event";

export interface SuggestionCardTarget {
  profileUserId?: string;
  eventId?: string;
  createParams?: {
    title?: string;
    locationName?: string;
    startAtISO?: string;
  };
}

export interface SuggestionCard {
  id: string;
  kind: SuggestionCardKind;
  title: string;
  body: string;
  primaryName?: string;
  target: SuggestionCardTarget;
  score: number;
  /** DEV-only: which rule produced this card */
  reasonTag: string;
}

// ─── Input types for rule functions ──────────────────────

export interface DeckReconnect {
  friendId: string;
  friendName: string | null;
  daysSinceHangout: number;
}

export interface DeckBirthday {
  friendId: string;
  friendName: string | null;
  birthday: string; // ISO date string
}

export interface DeckEvent {
  id: string;
  title: string;
  hostName: string | null;
  hostId: string;
  startTime: string; // ISO
  goingCount?: number;
  capacity?: number | null;
}

export interface DeckMyEvent {
  title: string;
  startTime: string; // ISO
}

export interface DeckInput {
  reconnects: DeckReconnect[];
  birthdays: DeckBirthday[];
  upcomingFriendEvents: DeckEvent[];
  myRecentEvents: DeckMyEvent[];
}

// ─── Helpers ─────────────────────────────────────────────

/** Returns "YYYY-MM-DD" in local timezone. */
export function getTodayKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function firstName(name: string | null | undefined): string {
  if (!name) return "a friend";
  return name.split(" ")[0] || name;
}

// ─── Rule A: Friend upcoming event with low RSVP ────────

function ruleUpcomingFriendEvent(
  events: DeckEvent[],
  todayKey: string,
): SuggestionCard[] {
  const cards: SuggestionCard[] = [];
  const todayMs = new Date(todayKey).getTime();

  for (const ev of events) {
    const evMs = new Date(ev.startTime).getTime();
    const diffDays = (evMs - todayMs) / (1000 * 60 * 60 * 24);
    if (diffDays < 0 || diffDays > 7) continue;

    const going = ev.goingCount ?? 0;
    const isLow =
      going < 5 ||
      (ev.capacity != null && ev.capacity > 0 && going < ev.capacity / 2);
    if (!isLow) continue;

    const host = firstName(ev.hostName);
    cards.push({
      id: `event_${ev.id}_${todayKey}`,
      kind: "open_event",
      title: `Join ${host}'s ${ev.title}?`,
      body: `Only ${going} going so far — could use you there.`,
      primaryName: host,
      target: { eventId: ev.id },
      score: 90 - diffDays * 5,
      reasonTag: "RULE_A_LOW_RSVP",
    });
  }
  return cards;
}

// ─── Rule B: Reconnect with friend ──────────────────────

function ruleReconnect(
  reconnects: DeckReconnect[],
  todayKey: string,
): SuggestionCard[] {
  const cards: SuggestionCard[] = [];
  for (const r of reconnects) {
    if (r.daysSinceHangout < 14) continue;
    const name = firstName(r.friendName);
    cards.push({
      id: `reconnect_${r.friendId}_${todayKey}`,
      kind: "create_event",
      title: `Catch up with ${name}?`,
      body: "It's been a while — plan something easy.",
      primaryName: name,
      target: {
        profileUserId: r.friendId,
        createParams: { title: `Coffee with ${name}` },
      },
      score: Math.min(80, 50 + r.daysSinceHangout / 7),
      reasonTag: "RULE_B_RECONNECT",
    });
  }
  return cards;
}

// ─── Rule C: Birthday coming up ─────────────────────────

function ruleBirthdaySoon(
  birthdays: DeckBirthday[],
  todayKey: string,
): SuggestionCard[] {
  const cards: SuggestionCard[] = [];
  const today = new Date(todayKey);
  const thisYear = today.getFullYear();

  for (const b of birthdays) {
    if (!b.birthday) continue;

    const bDate = new Date(b.birthday);
    if (isNaN(bDate.getTime())) continue;

    const thisYearBday = new Date(thisYear, bDate.getMonth(), bDate.getDate());
    const diffMs = thisYearBday.getTime() - today.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffDays < 0 || diffDays > 7) continue;

    const name = firstName(b.friendName);
    cards.push({
      id: `birthday_${b.friendId}_${todayKey}`,
      kind: "create_event",
      title: `${name}'s birthday is ${diffDays <= 1 ? "tomorrow" : "coming up"}!`,
      body: "Plan something to celebrate.",
      primaryName: name,
      target: {
        profileUserId: b.friendId,
        createParams: { title: `${name}'s birthday` },
      },
      score: 95 - diffDays * 3,
      reasonTag: "RULE_C_BIRTHDAY",
    });
  }
  return cards;
}

// ─── Rule D: Repeat a recent event pattern ──────────────

function ruleRepeatEvent(
  myEvents: DeckMyEvent[],
  todayKey: string,
): SuggestionCard[] {
  const cards: SuggestionCard[] = [];
  const todayMs = new Date(todayKey).getTime();

  // Track latest occurrence per title (case-insensitive)
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

  for (const [key, { title, lastDate }] of titleMap) {
    const diffDays =
      (todayMs - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24);
    // Only suggest titles from 1–4 weeks ago
    if (diffDays < 7 || diffDays > 30) continue;

    cards.push({
      id: `repeat_${key.replace(/\s+/g, "_")}_${todayKey}`,
      kind: "create_event",
      title: `Run back ${title}?`,
      body: "It's been a bit — your crew might be down.",
      target: {
        createParams: { title },
      },
      score: 60,
      reasonTag: "RULE_D_REPEAT",
    });
  }
  return cards;
}

// ─── Core API ────────────────────────────────────────────

const MAX_CARDS_PER_DAY = 10;

/** Dedupe: max 1 card per friend per day (event cards bypass friend dedup). */
export function rankAndDedupe(cards: SuggestionCard[]): SuggestionCard[] {
  const sorted = [...cards].sort((a, b) => b.score - a.score);
  const seenFriends = new Set<string>();
  const result: SuggestionCard[] = [];

  for (const card of sorted) {
    // open_event cards are event-specific, bypass friend dedup
    if (card.kind === "open_event") {
      result.push(card);
      if (card.primaryName) seenFriends.add(card.primaryName);
      continue;
    }

    if (card.primaryName && seenFriends.has(card.primaryName)) continue;
    if (card.primaryName) seenFriends.add(card.primaryName);
    result.push(card);
  }

  return result.slice(0, MAX_CARDS_PER_DAY);
}

/** Build the daily deck from all available inputs. */
export function buildDailyDeck(
  input: DeckInput,
  todayKey: string,
): SuggestionCard[] {
  const ruleACards = ruleUpcomingFriendEvent(
    input.upcomingFriendEvents,
    todayKey,
  );
  const ruleBCards = ruleReconnect(input.reconnects, todayKey);
  const ruleCCards = ruleBirthdaySoon(input.birthdays, todayKey);
  const ruleDCards = ruleRepeatEvent(input.myRecentEvents, todayKey);

  if (__DEV__) {
    devLog(
      `[P1_SUGGESTIONS_DECK] inputs: reconnects=${input.reconnects.length} birthdays=${input.birthdays.length} friendEvents=${input.upcomingFriendEvents.length} myEvents=${input.myRecentEvents.length}`,
    );
    devLog(
      `[P1_SUGGESTIONS_DECK] cards per rule: A=${ruleACards.length} B=${ruleBCards.length} C=${ruleCCards.length} D=${ruleDCards.length}`,
    );
  }

  const allCards = [
    ...ruleACards,
    ...ruleBCards,
    ...ruleCCards,
    ...ruleDCards,
  ];
  const deck = rankAndDedupe(allCards);

  if (__DEV__) {
    devLog(`[P1_SUGGESTIONS_DECK] final deck size: ${deck.length}`);
  }

  return deck;
}
