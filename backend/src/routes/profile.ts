import { Hono } from "hono";
import { db } from "../db";
import { type AppType } from "../types";
import { updateProfileRequestSchema, searchUsersRequestSchema } from "../shared/contracts";
import { getBlockedUserIds, getBlockedByUserIds } from "./blocked";
import { normalizeHandle, validateHandle } from "../lib/handleUtils";
import {
  normalizeSearchQuery,
  normalizeName,
  normalizePhone,
  validateName,
  validatePhone,
  createValidationError,
  toPublicUserDTO,
  type PublicUserWithMutuals,
} from "../lib/validation";

export const profileRouter = new Hono<AppType>();

// GET /api/profile - Get current user's profile
profileRouter.get("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const profile = await db.profile.findUnique({
    where: { userId: user.id },
  });

  const userData = await db.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      image: true,
      Profile: true,
    },
  });

  return c.json({
    profile,
    user: userData,
  });
});

// PUT /api/profile - Update current user's profile
profileRouter.put("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const parsed = updateProfileRequestSchema.safeParse(body);

  if (!parsed.success) {
    // Convert Zod errors to standard validation error format
    const fields = parsed.error.issues.map((e) => ({
      field: String(e.path.join(".") || "body"),
      reason: e.message,
    }));
    return c.json(createValidationError(fields), 400);
  }

  const { handle: rawHandle, bio, calendarBio, avatarUrl, name: rawName, phone: rawPhone, birthday, showBirthdayToFriends, hideBirthdays, omitBirthdayYear } = parsed.data;

  // Collect validation errors
  const validationErrors: Array<{ field: string; reason: string }> = [];

  // Normalize and validate name if provided
  let normalizedName: string | undefined = undefined;
  if (rawName !== undefined) {
    normalizedName = normalizeName(rawName);
    if (normalizedName) {
      const nameError = validateName(normalizedName);
      if (nameError) validationErrors.push(nameError);
    }
  }

  // Normalize and validate phone if provided
  let normalizedPhoneValue: string | null | undefined = undefined;
  if (rawPhone !== undefined) {
    normalizedPhoneValue = rawPhone ? normalizePhone(rawPhone) : null;
    if (normalizedPhoneValue) {
      const phoneError = validatePhone(normalizedPhoneValue);
      if (phoneError) validationErrors.push(phoneError);
    }
  }

  // Normalize and validate handle if provided
  let normalizedHandle: string | undefined = undefined;
  if (rawHandle !== undefined) {
    normalizedHandle = normalizeHandle(rawHandle);

    if (normalizedHandle) {
      // Validate handle format
      const validation = validateHandle(normalizedHandle);
      if (!validation.valid) {
        validationErrors.push({
          field: "handle",
          reason: validation.error ?? "Must be 3-20 chars and contain only letters, numbers, dot, underscore",
        });
      }
    }
  }

  // Return all validation errors at once
  if (validationErrors.length > 0) {
    return c.json(createValidationError(validationErrors), 400);
  }

  // Check handle uniqueness (only if handle is valid and provided)
  if (normalizedHandle) {
    const existingProfile = await db.profile.findFirst({
      where: {
        handle: normalizedHandle,
        NOT: { userId: user.id },
      },
    });

    if (existingProfile) {
      return c.json({
        error: "That username is already taken",
        code: "HANDLE_TAKEN"
      }, 409);
    }

    // Check 30-day cooldown for username changes (only if user already has a profile with a handle)
    const currentProfile = await db.profile.findUnique({
      where: { userId: user.id },
      select: { handle: true, usernameLastChangedAt: true },
    });

    if (currentProfile && currentProfile.usernameLastChangedAt) {
      const daysSinceLastChange = Math.floor(
        (Date.now() - new Date(currentProfile.usernameLastChangedAt).getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceLastChange < 30) {
        const daysRemaining = 30 - daysSinceLastChange;
        const nextEligibleDate = new Date(currentProfile.usernameLastChangedAt);
        nextEligibleDate.setDate(nextEligibleDate.getDate() + 30);

        return c.json({
          error: `You can change your username again in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`,
          code: "USERNAME_COOLDOWN",
          daysRemaining,
          nextEligibleDate: nextEligibleDate.toISOString(),
        }, 429);
      }
    }
  }

  // Update user name, image, and/or phone if provided
  const userUpdates: { name?: string; image?: string; phone?: string | null } = {};
  if (normalizedName) {
    userUpdates.name = normalizedName;
  }
  if (avatarUrl) {
    userUpdates.image = avatarUrl;
  }
  if (normalizedPhoneValue !== undefined) {
    userUpdates.phone = normalizedPhoneValue;
  }

  if (Object.keys(userUpdates).length > 0) {
    try {
      // If updating phone, check if it's already taken
      if (userUpdates.phone) {
        const existingUserWithPhone = await db.user.findFirst({
          where: {
            phone: userUpdates.phone,
            id: { not: user.id },
          },
        });
        if (existingUserWithPhone) {
          return c.json({ error: "Phone number is already in use by another account" }, 409);
        }
      }

      await db.user.update({
        where: { id: user.id },
        data: userUpdates,
      });
    } catch (error: unknown) {
      // Handle unique constraint violation
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        return c.json({ error: "Phone number is already in use by another account" }, 409);
      }
      throw error;
    }
  }

  // Update or create profile
  let profile = null;
  const hasBirthdayUpdates = birthday !== undefined || showBirthdayToFriends !== undefined || hideBirthdays !== undefined || omitBirthdayYear !== undefined;
  const hasProfileUpdates = normalizedHandle !== undefined || bio !== undefined || calendarBio !== undefined || avatarUrl !== undefined || hasBirthdayUpdates;

  if (hasProfileUpdates) {
    const existingProfile = await db.profile.findUnique({
      where: { userId: user.id },
    });

    if (existingProfile) {
      profile = await db.profile.update({
        where: { userId: user.id },
        data: {
          handle: normalizedHandle || existingProfile.handle,
          bio: bio ?? existingProfile.bio,
          calendarBio: calendarBio ?? existingProfile.calendarBio,
          avatarUrl: avatarUrl ?? existingProfile.avatarUrl,
          birthday: birthday ? new Date(birthday) : (birthday === null ? null : existingProfile.birthday),
          showBirthdayToFriends: showBirthdayToFriends ?? existingProfile.showBirthdayToFriends,
          hideBirthdays: hideBirthdays ?? existingProfile.hideBirthdays,
          omitBirthdayYear: omitBirthdayYear ?? existingProfile.omitBirthdayYear,
          // Set usernameLastChangedAt timestamp if handle is being changed
          usernameLastChangedAt: normalizedHandle && normalizedHandle !== existingProfile.handle
            ? new Date()
            : existingProfile.usernameLastChangedAt,
        },
      });
    } else if (normalizedHandle) {
      // We already validated and checked uniqueness above, so just create
      // For new profiles, set usernameLastChangedAt to now
      profile = await db.profile.create({
        data: {
          userId: user.id,
          handle: normalizedHandle,
          bio: bio ?? null,
          calendarBio: calendarBio ?? null,
          avatarUrl: avatarUrl ?? null,
          birthday: birthday ? new Date(birthday) : null,
          showBirthdayToFriends: showBirthdayToFriends ?? false,
          hideBirthdays: hideBirthdays ?? false,
          omitBirthdayYear: omitBirthdayYear ?? false,
          usernameLastChangedAt: new Date(), // Initial set timestamp
        },
      });
    } else {
      // Create profile without handle if we just have avatarUrl or bio
      profile = await db.profile.create({
        data: {
          userId: user.id,
          handle: `user_${user.id.slice(0, 8)}`,
          bio: bio ?? null,
          calendarBio: calendarBio ?? null,
          avatarUrl: avatarUrl ?? null,
          birthday: birthday ? new Date(birthday) : null,
          showBirthdayToFriends: showBirthdayToFriends ?? false,
          hideBirthdays: hideBirthdays ?? false,
          omitBirthdayYear: omitBirthdayYear ?? false,
        },
      });
    }
  }

  // Format birthday and usernameLastChangedAt for response
  const formattedProfile = profile ? {
    ...profile,
    birthday: profile.birthday ? profile.birthday.toISOString() : null,
    usernameLastChangedAt: profile.usernameLastChangedAt ? profile.usernameLastChangedAt.toISOString() : null,
  } : null;

  return c.json({ success: true, profile: formattedProfile });
});

// GET /api/profile/search - Search users (Instagram-style, ranked results)
// Query params: q (search query), limit (optional, default 20)
// Response: { users: [{ id, name, handle, avatarUrl, mutualCount?, isFriend? }] }
// Note: NO EMAIL or PHONE in response - only public user data
profileRouter.get("/search", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const rawQuery = c.req.query("q") ?? "";
  const limitParam = c.req.query("limit");
  const limit = Math.min(parseInt(limitParam ?? "20", 10) || 20, 50);

  // Normalize query using validation utility
  const query = normalizeSearchQuery(rawQuery).toLowerCase();

  // Empty query after trim returns empty results (no-op)
  if (query.length < 1) {
    return c.json({ users: [] });
  }

  // Detect query type
  const isHandleQuery = query.startsWith("@");
  const handleQuery = isHandleQuery ? query.slice(1) : query;
  const isEmailLike = query.includes("@") && !isHandleQuery;
  const normalizedDigits = query.replace(/[^\d]/g, "");
  const isPhoneLike = normalizedDigits.length >= 4 && normalizedDigits.length >= query.replace(/[\s\-\(\)\.+]/g, "").length * 0.7;

  // Get blocked user IDs (both directions)
  const [blockedByMe, blockedMe] = await Promise.all([
    getBlockedUserIds(user.id),
    getBlockedByUserIds(user.id),
  ]);
  const allBlockedIds = [...new Set([...blockedByMe, ...blockedMe])];

  // Get current user's friends for mutual friend calculation
  const friendships = await db.friendship.findMany({
    where: { userId: user.id },
    select: { friendId: true },
  });
  const friendIds = new Set(friendships.map((f) => f.friendId));

  // Build search conditions based on query type
  const searchConditions: any[] = [];

  if (isHandleQuery && handleQuery.length > 0) {
    // Handle search: @username
    searchConditions.push({ Profile: { handle: { contains: handleQuery, mode: "insensitive" } } });
  } else if (isEmailLike) {
    // Email search: exact or prefix match
    searchConditions.push({ email: { contains: query, mode: "insensitive" } });
  } else if (isPhoneLike) {
    // Phone search: normalized digits
    searchConditions.push({ phone: { contains: normalizedDigits } });
  } else {
    // General search: name, email prefix, handle
    searchConditions.push(
      { name: { contains: query, mode: "insensitive" } },
      { email: { startsWith: query, mode: "insensitive" } },
      { Profile: { handle: { contains: query, mode: "insensitive" } } }
    );
  }

  const users = await db.user.findMany({
    where: {
      AND: [
        { id: { not: user.id } },
        { id: { notIn: allBlockedIds.length > 0 ? allBlockedIds : ["__none__"] } },
        { OR: searchConditions },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      image: true,
      Profile: {
        select: {
          handle: true,
          avatarUrl: true,
        },
      },
      // Get this user's friends to calculate mutual count
      friendship_friendship_userIdTouser: {
        select: { friendId: true },
      },
    },
    take: limit * 2, // Fetch more to allow for ranking
  });

  // Calculate mutual friends and rank results
  const rankedUsers = users.map((u) => {
    const userFriendIds = new Set(u.friendship_friendship_userIdTouser.map((f) => f.friendId));
    const mutualCount = [...friendIds].filter((fid) => userFriendIds.has(fid)).length;
    const isFriend = friendIds.has(u.id);

    // Calculate ranking score
    let score = 0;
    const nameLower = u.name?.toLowerCase() ?? "";
    const handleLower = u.Profile?.handle?.toLowerCase() ?? "";
    const emailLower = u.email?.toLowerCase() ?? "";

    // Exact handle match (highest priority)
    if (handleLower === (isHandleQuery ? handleQuery : query)) score += 1000;
    // Exact email match
    else if (emailLower === query) score += 900;
    // Handle starts with query
    else if (handleLower.startsWith(isHandleQuery ? handleQuery : query)) score += 800;
    // Name starts with query
    else if (nameLower.startsWith(query)) score += 700;
    // Email starts with query
    else if (emailLower.startsWith(query)) score += 600;
    // Name contains query
    else if (nameLower.includes(query)) score += 400;
    // Handle contains query
    else if (handleLower.includes(isHandleQuery ? handleQuery : query)) score += 300;

    // Boost for mutual friends
    score += mutualCount * 50;
    // Boost for existing friends
    if (isFriend) score += 200;

    return {
      id: u.id,
      name: u.name,
      // Note: email is NOT returned publicly for privacy - only handle is shown as public identifier
      avatarUrl: u.Profile?.avatarUrl ?? u.image ?? null,
      handle: u.Profile?.handle ?? null,
      mutualCount,
      isFriend,
      _score: score,
    };
  });

  // Sort by score descending, then by name
  rankedUsers.sort((a, b) => {
    if (b._score !== a._score) return b._score - a._score;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });

  // Remove internal score field and limit results
  const results = rankedUsers.slice(0, limit).map(({ _score, ...user }) => user);

  return c.json({ users: results });
});

// POST /api/profile/search - Legacy endpoint (for backwards compatibility)
// Response: { users: [{ id, name, handle, avatarUrl }] }
// Note: NO EMAIL in response - only public user data
profileRouter.post("/search", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const parsed = searchUsersRequestSchema.safeParse(body);

  if (!parsed.success) {
    const fields = parsed.error.issues.map((e) => ({
      field: String(e.path.join(".") || "body"),
      reason: e.message,
    }));
    return c.json(createValidationError(fields), 400);
  }

  // Normalize query
  const query = normalizeSearchQuery(parsed.data.query).toLowerCase();

  // Empty query returns empty results (no-op)
  if (!query) {
    return c.json({ users: [] });
  }

  // Normalize for phone search - remove non-digits
  const normalizedQuery = query.replace(/[^\d]/g, '');

  // Get blocked user IDs (both directions - exclude those I blocked AND those who blocked me)
  const [blockedByMe, blockedMe] = await Promise.all([
    getBlockedUserIds(user.id),
    getBlockedByUserIds(user.id),
  ]);
  const allBlockedIds = [...new Set([...blockedByMe, ...blockedMe])];

  const users = await db.user.findMany({
    where: {
      AND: [
        { id: { not: user.id } }, // Exclude current user
        { id: { notIn: allBlockedIds.length > 0 ? allBlockedIds : ["__none__"] } }, // Exclude blocked users (both directions)
        {
          OR: [
            { email: { contains: query } },
            { name: { contains: query } },
            { Profile: { handle: { contains: query } } },
            // Search by phone if query looks like a phone number (has 4+ digits)
            ...(normalizedQuery.length >= 4 ? [{ phone: { contains: normalizedQuery } }] : []),
          ],
        },
      ],
    },
    select: {
      id: true,
      name: true,
      image: true,
      Profile: {
        select: {
          handle: true,
          avatarUrl: true,
        },
      },
    },
    take: 20,
  });

  // Map to public DTO format (no email/phone)
  const publicUsers = users.map((u) => toPublicUserDTO(u));

  return c.json({ users: publicUsers });
});

// GET /api/profile/stats - Get user's profile stats for gamification
profileRouter.get("/stats", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const now = new Date();

  // Get all events hosted by user (for calculations like streaks, categories, etc.)
  const hostedEvents = await db.event.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      category: true,
      startTime: true,
      endTime: true,
      event_join_request: {
        where: { status: "accepted" },
        select: { userId: true },
      },
    },
    orderBy: { startTime: "desc" },
  });

  // Get events user has attended (accepted join requests)
  const attendedEvents = await db.event_join_request.findMany({
    where: {
      userId: user.id,
      status: "accepted",
    },
    include: {
      event: {
        select: {
          id: true,
          userId: true,
          startTime: true,
          endTime: true,
        },
      },
    },
  });

  // Filter to only count FINISHED events (event has ended)
  // An event is finished if:
  // - endTime exists and has passed, OR
  // - startTime has passed (for events without explicit end time, assume they're done after start)
  const finishedHostedEvents = hostedEvents.filter((event) => {
    const endTime = event.endTime ? new Date(event.endTime) : null;
    const startTime = new Date(event.startTime);
    // If there's an end time, check if it's passed; otherwise check if start time passed
    return endTime ? endTime < now : startTime < now;
  });

  const finishedAttendedEvents = attendedEvents.filter((attended) => {
    const event = attended.event;
    const endTime = event.endTime ? new Date(event.endTime) : null;
    const startTime = new Date(event.startTime);
    return endTime ? endTime < now : startTime < now;
  });

  // Calculate finished hosted events count
  const hostedCount = finishedHostedEvents.length;

  // Calculate finished attended events count
  const attendedCount = finishedAttendedEvents.length;

  // Calculate event types breakdown (only from finished events)
  const categoryBreakdown: Record<string, number> = {};
  for (const event of finishedHostedEvents) {
    const cat = event.category ?? "other";
    categoryBreakdown[cat] = (categoryBreakdown[cat] ?? 0) + 1;
  }

  // Find max attendees for any single finished event
  let maxAttendeesEvent = 0;
  for (const event of finishedHostedEvents) {
    const attendees = event.event_join_request.length;
    if (attendees > maxAttendeesEvent) {
      maxAttendeesEvent = attendees;
    }
  }

  // Calculate hosting streak (consecutive weeks with at least one hosted event)
  // Use all hosted events (including future) for streak calculation
  let currentStreak = 0;
  const weekMs = 7 * 24 * 60 * 60 * 1000;

  // Sort events by date (most recent first) and check consecutive weeks
  const sortedEvents = [...hostedEvents].sort(
    (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  );

  if (sortedEvents.length > 0) {
    let checkWeekStart = new Date(now);
    checkWeekStart.setDate(checkWeekStart.getDate() - checkWeekStart.getDay()); // Start of current week
    checkWeekStart.setHours(0, 0, 0, 0);

    // Check each week going back
    while (true) {
      const weekEnd = new Date(checkWeekStart.getTime() + weekMs);
      const hasEventThisWeek = sortedEvents.some((e) => {
        const eventTime = new Date(e.startTime);
        return eventTime >= checkWeekStart && eventTime < weekEnd;
      });

      if (hasEventThisWeek) {
        currentStreak++;
        checkWeekStart = new Date(checkWeekStart.getTime() - weekMs);
      } else {
        break;
      }
    }
  }

  // Calculate top 3 friends (friends we've attended most FINISHED events together with)
  const friendEventCounts: Record<string, { count: number; friendId: string }> = {};

  // Count friends who attended my finished events
  for (const event of finishedHostedEvents) {
    for (const joinRequest of event.event_join_request) {
      const friendId = joinRequest.userId;
      if (!friendEventCounts[friendId]) {
        friendEventCounts[friendId] = { count: 0, friendId };
      }
      friendEventCounts[friendId].count++;
    }
  }

  // Count finished events I attended that were hosted by friends
  for (const attended of finishedAttendedEvents) {
    const hostId = attended.event.userId;
    if (!friendEventCounts[hostId]) {
      friendEventCounts[hostId] = { count: 0, friendId: hostId };
    }
    friendEventCounts[hostId].count++;
  }

  // Get top 3 friend IDs by event count
  const topFriendIds = Object.values(friendEventCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  // Fetch friend details
  const topFriends = await Promise.all(
    topFriendIds.map(async ({ friendId, count }) => {
      const friend = await db.user.findUnique({
        where: { id: friendId },
        select: {
          id: true,
          name: true,
          image: true,
        },
      });
      return friend ? { ...friend, eventsCount: count } : null;
    })
  );

  // Define achievements (based on finished events)
  const achievements = [
    {
      id: "first_host",
      name: "Party Starter",
      description: "Host your first event",
      emoji: "🎉",
      unlocked: hostedCount >= 1,
      progress: Math.min(hostedCount, 1),
      target: 1,
    },
    {
      id: "host_10",
      name: "Social Butterfly",
      description: "Host 10 events",
      emoji: "🦋",
      unlocked: hostedCount >= 10,
      progress: Math.min(hostedCount, 10),
      target: 10,
    },
    {
      id: "host_20",
      name: "Event Master",
      description: "Host 20 events",
      emoji: "👑",
      unlocked: hostedCount >= 20,
      progress: Math.min(hostedCount, 20),
      target: 20,
    },
    {
      id: "attend_10",
      name: "Good Friend",
      description: "Attend 10 events",
      emoji: "🤝",
      unlocked: attendedCount >= 10,
      progress: Math.min(attendedCount, 10),
      target: 10,
    },
    {
      id: "attend_30",
      name: "Social Star",
      description: "Attend 30 events",
      emoji: "⭐",
      unlocked: attendedCount >= 30,
      progress: Math.min(attendedCount, 30),
      target: 30,
    },
    {
      id: "big_event",
      name: "Big Bash",
      description: "Host an event with 10+ attendees",
      emoji: "🎊",
      unlocked: maxAttendeesEvent >= 10,
      progress: Math.min(maxAttendeesEvent, 10),
      target: 10,
    },
    {
      id: "mega_event",
      name: "Mega Party",
      description: "Host an event with 50+ attendees",
      emoji: "🔥",
      unlocked: maxAttendeesEvent >= 50,
      progress: Math.min(maxAttendeesEvent, 50),
      target: 50,
    },
    {
      id: "century_event",
      name: "Legendary Host",
      description: "Host an event with 100+ attendees",
      emoji: "💯",
      unlocked: maxAttendeesEvent >= 100,
      progress: Math.min(maxAttendeesEvent, 100),
      target: 100,
    },
    {
      id: "streak_4",
      name: "Consistent",
      description: "4 week hosting streak",
      emoji: "🔄",
      unlocked: currentStreak >= 4,
      progress: Math.min(currentStreak, 4),
      target: 4,
    },
    {
      id: "streak_12",
      name: "Dedicated Host",
      description: "12 week hosting streak",
      emoji: "💪",
      unlocked: currentStreak >= 12,
      progress: Math.min(currentStreak, 12),
      target: 12,
    },
  ];

  return c.json({
    stats: {
      hostedCount,
      attendedCount,
      categoryBreakdown,
      currentStreak,
      maxAttendeesEvent,
    },
    topFriends: topFriends.filter(Boolean),
    achievements,
  });
});

// GET /api/users/:id/profile - Get a user's public profile (for viewing non-friends)
profileRouter.get("/:id/profile", async (c) => {
  const currentUser = c.get("user");
  if (!currentUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const userId = c.req.param("id");

  // Get blocked user IDs (both directions)
  const [blockedByMe, blockedMe] = await Promise.all([
    getBlockedUserIds(currentUser.id),
    getBlockedByUserIds(currentUser.id),
  ]);
  const allBlockedIds = [...new Set([...blockedByMe, ...blockedMe])];

  // Check if user is blocked
  if (allBlockedIds.includes(userId)) {
    return c.json({ error: "User not found" }, 404);
  }

  // Fetch the user
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      Profile: {
        select: {
          handle: true,
          bio: true,
          calendarBio: true,
          avatarUrl: true,
        },
      },
    },
  });

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  // Check if they are already friends
  const friendship = await db.friendship.findUnique({
    where: {
      userId_friendId: {
        userId: currentUser.id,
        friendId: userId,
      },
    },
  });

  const isFriend = !!friendship;

  // Check if there's a pending friend request (either direction)
  const pendingRequest = await db.friend_request.findFirst({
    where: {
      OR: [
        { senderId: currentUser.id, receiverId: userId, status: "pending" },
        { senderId: userId, receiverId: currentUser.id, status: "pending" },
      ],
    },
  });

  const hasPendingRequest = !!pendingRequest;
  // Check if this is an incoming request (they sent to me)
  const incomingRequestId = pendingRequest?.senderId === userId ? pendingRequest.id : null;

  return c.json({
    user: {
      ...user,
      // Hide email for privacy if not friends (or if user has no email)
      email: isFriend
        ? user.email
        : user.email
          ? (user.email.split("@")[0]?.slice(0, 3) ?? "***") + "***@***"
          : null,
    },
    isFriend,
    friendshipId: friendship?.id ?? null, // Include friendship ID for navigation to friend profile
    hasPendingRequest,
    incomingRequestId, // ID of the request if they sent it to me (so I can accept/reject)
  });
});

// DELETE /api/profile/admin/delete-user - Delete a user by email (TEMPORARY ADMIN ENDPOINT)
profileRouter.delete("/admin/delete-user/:email", async (c) => {
  const email = c.req.param("email")?.toLowerCase();

  if (!email) {
    return c.json({ error: "Email is required" }, 400);
  }

  console.log(`🗑️ [Admin] Attempting to delete user: ${email}`);

  const user = await db.user.findUnique({ where: { email } });

  if (!user) {
    console.log(`🗑️ [Admin] User not found: ${email}`);
    return c.json({ error: "User not found", email }, 404);
  }

  // Delete related data first
  await db.email_verification_code.deleteMany({ where: { email } });
  await db.profile.deleteMany({ where: { userId: user.id } });
  await db.session.deleteMany({ where: { userId: user.id } });
  await db.account.deleteMany({ where: { userId: user.id } });

  // Delete friendships
  await db.friendship.deleteMany({ where: { OR: [{ userId: user.id }, { friendId: user.id }] } });

  // Delete friend requests
  await db.friend_request.deleteMany({ where: { OR: [{ senderId: user.id }, { receiverId: user.id }] } });

  // Delete the user
  await db.user.delete({ where: { id: user.id } });

  console.log(`🗑️ [Admin] Successfully deleted user: ${email}`);

  return c.json({ success: true, message: `User ${email} deleted`, userId: user.id });
});
