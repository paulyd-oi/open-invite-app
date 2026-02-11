/**
 * ideasEngine.ts — Deterministic idea-card generation for the Suggestions/Ideas screen.
 *
 * Pure functions only. No hooks, no AsyncStorage, no UI imports.
 * Card generation rules operate on pre-fetched data passed as IdeasContext.
 *
 * SSOT for: IdeaCard, IdeaCategory, IdeasContext, generateIdeas()
 */

import { devLog } from "@/lib/devLog";

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
}

export interface IdeasMyEvent {
  title: string;
  startTime: string; // ISO
}

export interface IdeasBirthday {
  friendId: string;
  friendName: string | null;
  birthday: string; // ISO date
}

export interface IdeasReconnect {
  friendId: string;
  friendName: string | null;
  daysSinceHangout: number;
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

// ─── Rule A: Reconnect ──────────────────────────────────

function ruleReconnect(
  reconnects: IdeasReconnect[],
  todayKey: string,
): IdeaCard[] {
  const cards: IdeaCard[] = [];
  for (const r of reconnects) {
    if (r.daysSinceHangout < 14) continue;
    const name = firstName(r.friendName);
    cards.push({
      id: `reconnect_${r.friendId}_${todayKey}`,
      category: "reconnect",
      friendId: r.friendId,
      title: `Catch up with ${name}?`,
      subtitle: "It's been a while — plan something easy.",
      draftMessage: "Hey! Want to catch up soon?",
      score: Math.min(85, 50 + r.daysSinceHangout / 7),
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
    cards.push({
      id: `low_rsvp_${ev.id}_${todayKey}`,
      category: "low_rsvp",
      eventId: ev.id,
      friendId: ev.hostId,
      title: `Join ${host}'s ${ev.title}?`,
      subtitle: "They could use company.",
      draftMessage: `I'm thinking about joining your ${ev.title} — save me a spot?`,
      score: 90 - diffDays * 5,
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
    cards.push({
      id: `birthday_${b.friendId}_${todayKey}`,
      category: "birthday",
      friendId: b.friendId,
      title: `${name}'s birthday is coming up`,
      subtitle: "Plan something fun?",
      draftMessage: `Your birthday is coming up! Want to plan something?`,
      score: 95 - diffDays * 2,
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
      title: `Do ${title} again this week?`,
      subtitle: "You've done this before.",
      draftMessage: `Want to do ${title} again this week?`,
      score: 60,
    });
  }
  return cards;
}

// ─── Ranking + dedup ─────────────────────────────────────

const MAX_CARDS = 10;

function rankAndDedupe(cards: IdeaCard[]): IdeaCard[] {
  const sorted = [...cards].sort((a, b) => b.score - a.score);
  const seenFriends = new Set<string>();
  const result: IdeaCard[] = [];

  for (const card of sorted) {
    // low_rsvp cards keyed by event, bypass friend dedup
    if (card.category === "low_rsvp") {
      result.push(card);
      if (card.friendId) seenFriends.add(card.friendId);
      continue;
    }
    // activity_repeat has no friend — always include
    if (!card.friendId) {
      result.push(card);
      continue;
    }
    if (seenFriends.has(card.friendId)) continue;
    seenFriends.add(card.friendId);
    result.push(card);
  }

  return result.slice(0, MAX_CARDS);
}

// ─── Engine entry point ──────────────────────────────────

export function generateIdeas(context: IdeasContext): IdeaCard[] {
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

  const allCards = [...ruleACards, ...ruleBCards, ...ruleCCards, ...ruleDCards];
  const deck = rankAndDedupe(allCards);

  if (__DEV__) {
    devLog(`[P1_IDEAS_ENGINE] final deck size: ${deck.length}`);
  }

  return deck;
}
