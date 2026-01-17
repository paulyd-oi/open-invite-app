import { Hono } from "hono";
import { db } from "../db";
import { type AppType } from "../types";
import { getBlockedUserIds, getBlockedByUserIds } from "./blocked";

export const birthdaysRouter = new Hono<AppType>();

// GET /api/birthdays - Get friends' birthdays AND user's own birthday for calendar display
birthdaysRouter.get("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Get user's own profile to include their birthday
  const userProfile = await db.profile.findUnique({
    where: { userId: user.id },
  });

  // Check if user has hideBirthdays enabled
  if (userProfile?.hideBirthdays) {
    // User chose to hide birthdays, return empty list (but still return their own)
    const myBirthday = userProfile?.birthday ? {
      id: user.id,
      name: user.name ?? "Me",
      image: user.image ?? null,
      birthday: userProfile.birthday.toISOString(),
      showYear: !userProfile.omitBirthdayYear,
      isOwnBirthday: true,
    } : null;

    return c.json({
      birthdays: myBirthday ? [myBirthday] : [],
      myBirthday: myBirthday,
    });
  }

  // Get blocked user IDs (both directions)
  const [blockedByMe, blockedMe] = await Promise.all([
    getBlockedUserIds(user.id),
    getBlockedByUserIds(user.id),
  ]);
  const allBlockedIds = [...new Set([...blockedByMe, ...blockedMe])];

  // Get all friendships where user is part of
  const friendships = await db.friendship.findMany({
    where: {
      OR: [{ userId: user.id }, { friendId: user.id }],
      isBlocked: false,
    },
    select: {
      userId: true,
      friendId: true,
    },
  });

  // Extract friend IDs
  const friendIds = friendships.map((f) =>
    f.userId === user.id ? f.friendId : f.userId
  );

  // Filter out blocked users
  const validFriendIds = friendIds.filter((id) => !allBlockedIds.includes(id));

  // Build the user's own birthday object if they have one set
  const myBirthday = userProfile?.birthday ? {
    id: user.id,
    name: user.name ?? "Me",
    image: user.image ?? null,
    birthday: userProfile.birthday.toISOString(),
    showYear: !userProfile.omitBirthdayYear,
    isOwnBirthday: true,
  } : null;

  if (validFriendIds.length === 0) {
    return c.json({
      birthdays: myBirthday ? [myBirthday] : [],
      myBirthday: myBirthday,
    });
  }

  // Get friends who have showBirthdayToFriends enabled and have a birthday set
  const friendsWithBirthdays = await db.user.findMany({
    where: {
      id: { in: validFriendIds },
      Profile: {
        showBirthdayToFriends: true,
        birthday: { not: null },
      },
    },
    select: {
      id: true,
      name: true,
      image: true,
      Profile: {
        select: {
          birthday: true,
          omitBirthdayYear: true,
        },
      },
    },
  });

  // Format birthdays for response
  const friendBirthdays = friendsWithBirthdays
    .filter((friend) => friend.Profile?.birthday)
    .map((friend) => ({
      id: friend.id,
      name: friend.name,
      image: friend.image,
      birthday: friend.Profile!.birthday!.toISOString(),
      showYear: !friend.Profile!.omitBirthdayYear,
      isOwnBirthday: false,
    }));

  // Combine user's birthday with friends' birthdays
  const allBirthdays = myBirthday
    ? [myBirthday, ...friendBirthdays]
    : friendBirthdays;

  return c.json({
    birthdays: allBirthdays,
    myBirthday: myBirthday,
  });
});
