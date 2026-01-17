import { Hono } from "hono";
import { db } from "../db";
import { type AppType } from "../types";
import { z } from "zod";

export const privacyRouter = new Hono<AppType>();

// Schema for updating privacy settings
const updatePrivacySettingsSchema = z.object({
  allowFriendRequests: z.enum(["everyone", "friends_of_friends", "nobody"]).optional(),
  showInFriendSuggestions: z.boolean().optional(),
  shareCalendarAvailability: z.boolean().optional(),
});

// GET /api/privacy - Get current user's privacy settings
privacyRouter.get("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const userData = await db.user.findUnique({
    where: { id: user.id },
    select: {
      allowFriendRequests: true,
      showInFriendSuggestions: true,
      shareCalendarAvailability: true,
    },
  });

  if (!userData) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({
    settings: {
      allowFriendRequests: userData.allowFriendRequests,
      showInFriendSuggestions: userData.showInFriendSuggestions,
      shareCalendarAvailability: userData.shareCalendarAvailability,
    },
  });
});

// PUT /api/privacy - Update privacy settings
privacyRouter.put("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const parsed = updatePrivacySettingsSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error }, 400);
  }

  const { allowFriendRequests, showInFriendSuggestions, shareCalendarAvailability } = parsed.data;

  const updateData: {
    allowFriendRequests?: string;
    showInFriendSuggestions?: boolean;
    shareCalendarAvailability?: boolean;
  } = {};

  if (allowFriendRequests !== undefined) {
    updateData.allowFriendRequests = allowFriendRequests;
  }
  if (showInFriendSuggestions !== undefined) {
    updateData.showInFriendSuggestions = showInFriendSuggestions;
  }
  if (shareCalendarAvailability !== undefined) {
    updateData.shareCalendarAvailability = shareCalendarAvailability;
  }

  await db.user.update({
    where: { id: user.id },
    data: updateData,
  });

  return c.json({ success: true });
});

// GET /api/privacy/export - Export all user data
privacyRouter.get("/export", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  console.log(`📦 [Privacy] Exporting data for user: ${user.id}`);

  // Gather all user data
  const [
    userData,
    profile,
    events,
    friendships,
    friendRequests,
    notifications,
    circles,
    groups,
    subscription,
    workSchedule,
    hangoutHistory,
    eventComments,
    eventPhotos,
  ] = await Promise.all([
    db.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        phone: true,
        name: true,
        emailVerified: true,
        image: true,
        createdAt: true,
        referralCode: true,
        referredBy: true,
        onboardingCompleted: true,
        allowFriendRequests: true,
        showInFriendSuggestions: true,
        shareCalendarAvailability: true,
      },
    }),
    db.profile.findUnique({
      where: { userId: user.id },
    }),
    db.event.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        title: true,
        description: true,
        location: true,
        emoji: true,
        startTime: true,
        endTime: true,
        isRecurring: true,
        recurrence: true,
        visibility: true,
        category: true,
        createdAt: true,
      },
    }),
    db.friendship.findMany({
      where: { userId: user.id },
      include: {
        user_friendship_friendIdTouser: {
          select: { id: true, name: true, email: true },
        },
      },
    }),
    db.friend_request.findMany({
      where: {
        OR: [{ senderId: user.id }, { receiverId: user.id }],
      },
    }),
    db.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.circle_member.findMany({
      where: { userId: user.id },
      include: {
        circle: {
          select: { name: true, emoji: true },
        },
      },
    }),
    db.friend_group.findMany({
      where: { userId: user.id },
    }),
    db.subscription.findUnique({
      where: { userId: user.id },
    }),
    db.work_schedule.findMany({
      where: { userId: user.id },
    }),
    db.hangout_history.findMany({
      where: { userId: user.id },
    }),
    db.event_comment.findMany({
      where: { userId: user.id },
    }),
    db.event_photo.findMany({
      where: { userId: user.id },
    }),
  ]);

  const exportData = {
    exportedAt: new Date().toISOString(),
    user: userData,
    profile,
    events,
    friendships: friendships.map((f) => ({
      id: f.id,
      friend: f.user_friendship_friendIdTouser,
      createdAt: f.createdAt,
    })),
    friendRequests,
    notifications,
    circles: circles.map((cm) => ({
      circleId: cm.circleId,
      circleName: cm.circle.name,
      circleEmoji: cm.circle.emoji,
      joinedAt: cm.joinedAt,
    })),
    groups,
    subscription,
    workSchedule,
    hangoutHistory,
    eventComments,
    eventPhotos,
  };

  console.log(`📦 [Privacy] Export complete for user: ${user.id}`);

  return c.json(exportData);
});

// DELETE /api/privacy/account - Delete user account and all data
privacyRouter.delete("/account", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  console.log(`🗑️ [Privacy] Account deletion requested for user: ${user.id}`);

  try {
    // Delete all related data in order (respecting foreign key constraints)
    // The cascade delete on user should handle most, but we'll be explicit

    // Delete push tokens
    await db.push_token.deleteMany({ where: { userId: user.id } });

    // Delete notification preferences
    await db.notification_preferences.deleteMany({ where: { userId: user.id } });

    // Delete notifications
    await db.notification.deleteMany({ where: { userId: user.id } });

    // Delete event-related data
    await db.event_photo.deleteMany({ where: { userId: user.id } });
    await db.event_comment.deleteMany({ where: { userId: user.id } });
    await db.event_interest.deleteMany({ where: { userId: user.id } });
    await db.event_join_request.deleteMany({ where: { userId: user.id } });
    await db.event.deleteMany({ where: { userId: user.id } });
    await db.event_template.deleteMany({ where: { userId: user.id } });
    await db.event_request_member.deleteMany({ where: { userId: user.id } });
    await db.event_request.deleteMany({ where: { creatorId: user.id } });

    // Delete circle memberships and messages
    await db.circle_message.deleteMany({ where: { userId: user.id } });
    await db.circle_member.deleteMany({ where: { userId: user.id } });

    // Delete friend-related data
    await db.friend_note.deleteMany({
      where: {
        friendship: {
          OR: [{ userId: user.id }, { friendId: user.id }],
        },
      },
    });
    await db.friend_group_membership.deleteMany({
      where: {
        friendship: {
          OR: [{ userId: user.id }, { friendId: user.id }],
        },
      },
    });
    await db.friendship.deleteMany({
      where: { OR: [{ userId: user.id }, { friendId: user.id }] },
    });
    await db.friend_request.deleteMany({
      where: { OR: [{ senderId: user.id }, { receiverId: user.id }] },
    });
    await db.friend_group.deleteMany({ where: { userId: user.id } });
    await db.pinned_friendship.deleteMany({ where: { userId: user.id } });

    // Delete blocked contacts
    await db.blocked_contact.deleteMany({
      where: { OR: [{ userId: user.id }, { blockedUserId: user.id }] },
    });

    // Delete work schedule
    await db.work_schedule.deleteMany({ where: { userId: user.id } });
    await db.work_schedule_settings.deleteMany({ where: { userId: user.id } });

    // Delete hangout history
    await db.hangout_history.deleteMany({ where: { userId: user.id } });

    // Delete stories
    await db.story_view.deleteMany({
      where: { story: { userId: user.id } },
    });
    await db.story_group_visibility.deleteMany({
      where: { story: { userId: user.id } },
    });
    await db.story.deleteMany({ where: { userId: user.id } });

    // Delete achievements and badges
    await db.unlocked_achievement.deleteMany({ where: { userId: user.id } });
    await db.user_badge.deleteMany({ where: { userId: user.id } });

    // Delete subscription
    await db.subscription.deleteMany({ where: { userId: user.id } });

    // Delete discount code redemptions
    await db.discount_code_redemption.deleteMany({ where: { userId: user.id } });

    // Delete business-related data
    await db.business_team_member.deleteMany({ where: { userId: user.id } });
    await db.business.deleteMany({ where: { ownerId: user.id } });

    // Delete referral rewards
    await db.referral_reward.deleteMany({ where: { userId: user.id } });

    // Delete profile
    await db.profile.deleteMany({ where: { userId: user.id } });

    // Delete sessions and accounts
    await db.session.deleteMany({ where: { userId: user.id } });
    await db.account.deleteMany({ where: { userId: user.id } });

    // Delete email verification codes for this user's email
    const userEmail = await db.user.findUnique({
      where: { id: user.id },
      select: { email: true },
    });
    if (userEmail?.email) {
      await db.email_verification_code.deleteMany({
        where: { email: userEmail.email },
      });
    }

    // Finally, delete the user
    await db.user.delete({ where: { id: user.id } });

    console.log(`🗑️ [Privacy] Account successfully deleted for user: ${user.id}`);

    return c.json({ success: true, message: "Account deleted successfully" });
  } catch (error) {
    console.error(`🗑️ [Privacy] Error deleting account for user ${user.id}:`, error);
    return c.json({ error: "Failed to delete account" }, 500);
  }
});
