import { Hono } from "hono";
import { db } from "../db";
import { type AppType } from "../types";
import { nanoid } from "nanoid";

export const suggestionsRouter = new Hono<AppType>();

// Suggestion action types
type SuggestionAction =
  | "JOIN_EVENT"
  | "NUDGE_CREATE"
  | "NUDGE_INVITE"
  | "RECONNECT_FRIEND"
  | "HOT_AREA";

interface SuggestionFeedItem {
  id: string;
  type: SuggestionAction;
  title: string;
  subtitle: string;
  ctaLabel: string;
  // Optional payload for navigation
  eventId?: string;
  userId?: string;
  category?: string;
}

// GET /api/suggestions/feed - Get personalized suggestions feed
suggestionsRouter.get("/feed", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const suggestions: SuggestionFeedItem[] = [];
    const now = new Date();

    // 1. JOIN_EVENT: Find upcoming events from friends the user hasn't RSVP'd to
    const friendships = await db.friendship.findMany({
      where: { userId: user.id },
      select: { friendId: true },
    });
    const friendIds = friendships.map((f) => f.friendId);

    if (friendIds.length > 0) {
      // Get user's existing RSVPs
      const userRsvps = await db.event_interest.findMany({
        where: { userId: user.id },
        select: { eventId: true },
      });
      const rsvpEventIds = new Set(userRsvps.map((r) => r.eventId));

      // Find upcoming events from friends
      const friendEvents = await db.event.findMany({
        where: {
          userId: { in: friendIds },
          startTime: { gte: now },
          visibility: { in: ["public", "friends"] },
          id: { notIn: Array.from(rsvpEventIds) },
        },
        include: {
          user: {
            select: { id: true, name: true, image: true },
          },
        },
        orderBy: { startTime: "asc" },
        take: 3,
      });

      for (const event of friendEvents) {
        suggestions.push({
          id: `join-${event.id}`,
          type: "JOIN_EVENT",
          title: event.title,
          subtitle: `${event.user?.name ?? "A friend"} is hosting`,
          ctaLabel: "View Invite",
          eventId: event.id,
        });
      }
    }

    // 2. NUDGE_CREATE: If user hasn't created an event in 14+ days
    const recentEvent = await db.event.findFirst({
      where: {
        userId: user.id,
        createdAt: { gte: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000) },
      },
    });

    if (!recentEvent) {
      suggestions.push({
        id: `nudge-create-${nanoid(6)}`,
        type: "NUDGE_CREATE",
        title: "Plan something fun",
        subtitle: "Your friends are waiting for your next invite",
        ctaLabel: "Create Invite",
      });
    }

    // 3. NUDGE_INVITE: If user has few friends (< 5), encourage inviting
    const friendCount = await db.friendship.count({
      where: { userId: user.id },
    });

    if (friendCount < 5) {
      suggestions.push({
        id: `nudge-invite-${nanoid(6)}`,
        type: "NUDGE_INVITE",
        title: "Grow your circle",
        subtitle: "Invite friends to see what they're up to",
        ctaLabel: "Invite Friends",
      });
    }

    // 4. RECONNECT_FRIEND: Find friends user hasn't interacted with in 30+ days
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Get friends the user hasn't had events with recently
    const recentInteractions = await db.event_interest.findMany({
      where: {
        userId: user.id,
        createdAt: { gte: thirtyDaysAgo },
      },
      select: {
        event: {
          select: {
            userId: true,
            event_interest: {
              select: { userId: true },
            },
          },
        },
      },
    });

    // Collect all user IDs from recent event interactions
    const recentlyInteractedIds = new Set<string>();
    for (const interest of recentInteractions) {
      recentlyInteractedIds.add(interest.event.userId);
      for (const ei of interest.event.event_interest) {
        recentlyInteractedIds.add(ei.userId);
      }
    }

    // Find friends not in recent interactions
    const dormantFriendships = await db.friendship.findMany({
      where: {
        userId: user.id,
        friendId: { notIn: Array.from(recentlyInteractedIds) },
      },
      include: {
        user_friendship_friendIdTouser: {
          select: { id: true, name: true, image: true },
        },
      },
      take: 2,
    });

    for (const friendship of dormantFriendships) {
      const friend = friendship.user_friendship_friendIdTouser;
      if (friend) {
        suggestions.push({
          id: `reconnect-${friend.id}`,
          type: "RECONNECT_FRIEND",
          title: `Reconnect with ${friend.name ?? "a friend"}`,
          subtitle: "It's been a while since you hung out",
          ctaLabel: "View Profile",
          userId: friend.id,
        });
      }
    }

    // 5. HOT_AREA: Suggest popular event categories
    // Find categories with most events in the last 7 days
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const popularCategories = await db.event.groupBy({
      by: ["category"],
      where: {
        startTime: { gte: weekAgo },
        category: { not: null },
        visibility: { in: ["public", "friends"] },
      },
      _count: { category: true },
      orderBy: { _count: { category: "desc" } },
      take: 1,
    });

    const topCategory = popularCategories[0];
    if (topCategory && topCategory.category && topCategory._count?.category) {
      const category = topCategory.category;
      const count = topCategory._count.category;
      suggestions.push({
        id: `hot-${category}`,
        type: "HOT_AREA",
        title: `${category} is trending`,
        subtitle: `${count} events this week`,
        ctaLabel: "Explore",
        category,
      });
    }

    // Limit to 5 suggestions total, prioritized by type
    const priorityOrder: SuggestionAction[] = [
      "JOIN_EVENT",
      "NUDGE_CREATE",
      "RECONNECT_FRIEND",
      "HOT_AREA",
      "NUDGE_INVITE",
    ];

    const sortedSuggestions = suggestions.sort((a, b) => {
      return priorityOrder.indexOf(a.type) - priorityOrder.indexOf(b.type);
    });

    return c.json({
      suggestions: sortedSuggestions.slice(0, 5),
    });
  } catch (error) {
    console.error("[Suggestions Feed] Error:", error);
    return c.json({ suggestions: [] });
  }
});
