import { Hono } from "hono";
import { db } from "../db";
import { type AppType } from "../types";
import {
  sendFriendRequestSchema,
  updateFriendRequestSchema,
  blockFriendRequestSchema,
} from "../shared/contracts";
import { nanoid } from "nanoid";
import { getBlockedUserIds, getBlockedByUserIds, isIdentifierBlocked } from "./blocked";
import { toPublicUserDTO } from "../lib/validation";

export const friendsRouter = new Hono<AppType>();

// Helper to serialize friendship - transforms Prisma field names to API contract names
const serializeFriendship = (friendship: {
  id: string;
  friendId: string;
  isBlocked: boolean;
  createdAt: Date;
  user_friendship_friendIdTouser: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
    Profile?: { handle: string; bio: string | null; calendarBio: string | null; avatarUrl: string | null } | null;
  } | null;
  friend_group_membership?: Array<{
    groupId: string;
    friend_group: { id: string; name: string; color: string };
  }>;
}) => {
  const { user_friendship_friendIdTouser, friend_group_membership, ...rest } = friendship;
  return {
    ...rest,
    createdAt: friendship.createdAt.toISOString(),
    // Transform to match API contract - rename to 'friend'
    friend: user_friendship_friendIdTouser ? {
      ...user_friendship_friendIdTouser,
      Profile: user_friendship_friendIdTouser.Profile ?? undefined,
    } : null,
    // Transform group memberships to match contract
    groupMemberships: friend_group_membership?.map(m => ({
      groupId: m.groupId,
      group: m.friend_group,
    })),
  };
};

// GET /api/friends - Get all friends
friendsRouter.get("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Get blocked user IDs (both directions)
  const [blockedByMe, blockedMe] = await Promise.all([
    getBlockedUserIds(user.id),
    getBlockedByUserIds(user.id),
  ]);
  const allBlockedIds = [...new Set([...blockedByMe, ...blockedMe])];

  const friendships = await db.friendship.findMany({
    where: {
      userId: user.id,
      friendId: { notIn: allBlockedIds }, // Exclude blocked users
    },
    include: {
      user_friendship_friendIdTouser: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          Profile: true,
        },
      },
      friend_group_membership: {
        include: {
          friend_group: { select: { id: true, name: true, color: true } },
        },
      },
    },
    orderBy: { user_friendship_friendIdTouser: { name: "asc" } },
  });

  return c.json({ friends: friendships.map(serializeFriendship) });
});

// GET /api/friends/requests - Get pending friend requests
friendsRouter.get("/requests", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Get blocked user IDs (both directions)
  const [blockedByMe, blockedMe] = await Promise.all([
    getBlockedUserIds(user.id),
    getBlockedByUserIds(user.id),
  ]);
  const allBlockedIds = [...new Set([...blockedByMe, ...blockedMe])];

  const [received, sent] = await Promise.all([
    db.friend_request.findMany({
      where: {
        receiverId: user.id,
        status: "pending",
        senderId: { notIn: allBlockedIds }, // Exclude requests from blocked users
      },
      include: {
        user_friend_request_senderIdTouser: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            Profile: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.friend_request.findMany({
      where: {
        senderId: user.id,
        status: "pending",
        receiverId: { notIn: allBlockedIds }, // Exclude requests to blocked users
      },
      include: {
        user_friend_request_receiverIdTouser: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            Profile: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Compute mutual friends for each received request
  const myFriendships = await db.friendship.findMany({
    where: { userId: user.id },
    select: { friendId: true },
  });
  const myFriendIds = new Set(myFriendships.map((f) => f.friendId));

  // Get friendship data for all senders to compute mutual friends
  const senderIds = received.map((r) => r.senderId);
  const senderFriendships = await db.friendship.findMany({
    where: { userId: { in: senderIds } },
    select: { userId: true, friendId: true },
  });

  // Group by sender
  const senderFriendMap = new Map<string, Set<string>>();
  for (const sf of senderFriendships) {
    if (!senderFriendMap.has(sf.userId)) {
      senderFriendMap.set(sf.userId, new Set());
    }
    senderFriendMap.get(sf.userId)!.add(sf.friendId);
  }

  // Compute mutual counts
  const mutualCountMap = new Map<string, number>();
  const mutualPreviewMap = new Map<string, { id: string; name: string | null; image: string | null }[]>();

  for (const senderId of senderIds) {
    const senderFriends = senderFriendMap.get(senderId) || new Set();
    const mutualIds = [...myFriendIds].filter((id) => senderFriends.has(id));
    mutualCountMap.set(senderId, mutualIds.length);

    // Fetch up to 3 preview users for display
    if (mutualIds.length > 0) {
      const previewUsers = await db.user.findMany({
        where: { id: { in: mutualIds.slice(0, 3) } },
        select: { id: true, name: true, image: true },
      });
      mutualPreviewMap.set(senderId, previewUsers);
    }
  }

  return c.json({
    received: received.map((r) => {
      const { user_friend_request_senderIdTouser, ...rest } = r;
      return {
        ...rest,
        createdAt: r.createdAt.toISOString(),
        sender: user_friend_request_senderIdTouser ?? null,
        mutualCount: mutualCountMap.get(r.senderId) ?? 0,
        mutualPreviewUsers: mutualPreviewMap.get(r.senderId) ?? [],
      };
    }),
    sent: sent.map((s) => {
      const { user_friend_request_receiverIdTouser, ...rest } = s;
      return {
        ...rest,
        createdAt: s.createdAt.toISOString(),
        receiver: user_friend_request_receiverIdTouser ?? null,
      };
    }),
  });
});

// POST /api/friends/request - Send friend request
friendsRouter.post("/request", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const parsed = sendFriendRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error }, 400);
  }

  // Check if the email/phone is blocked by us
  const isBlocked = await isIdentifierBlocked(user.id, parsed.data.email, parsed.data.phone);
  if (isBlocked) {
    // Don't reveal they're blocked - just say user not found
    return c.json({ success: false, message: "User not found. They may need to sign up first." });
  }

  // Find target user by email, phone, or userId
  let targetUser = null;
  if (parsed.data.userId) {
    targetUser = await db.user.findUnique({
      where: { id: parsed.data.userId },
    });
  } else if (parsed.data.email) {
    targetUser = await db.user.findUnique({
      where: { email: parsed.data.email },
    });
  } else if (parsed.data.phone) {
    // Normalize phone number (remove spaces, dashes, etc.)
    const normalizedPhone = parsed.data.phone.replace(/[\s\-\(\)]/g, "");
    targetUser = await db.user.findFirst({
      where: { phone: normalizedPhone },
    });
  }

  if (!targetUser) {
    return c.json({ success: false, message: "User not found. They may need to sign up first." });
  }

  if (targetUser.id === user.id) {
    return c.json({ success: false, message: "Cannot send friend request to yourself" });
  }

  // Check if either user has blocked the other
  const [iBlockedThem, theyBlockedMe] = await Promise.all([
    getBlockedUserIds(user.id),
    getBlockedByUserIds(user.id),
  ]);

  if (iBlockedThem.includes(targetUser.id)) {
    // Don't reveal they're blocked - say user not found
    return c.json({ success: false, message: "User not found. They may need to sign up first." });
  }

  if (theyBlockedMe.includes(targetUser.id)) {
    // If they blocked us, silently fail (they don't know we tried)
    // Return success but don't actually send the request
    return c.json({ success: true, message: "Friend request sent!" });
  }

  // Check privacy settings - who can send friend requests
  if (targetUser.allowFriendRequests === "nobody") {
    // Silently fail - don't reveal their privacy setting
    return c.json({ success: true, message: "Friend request sent!" });
  }

  if (targetUser.allowFriendRequests === "friends_of_friends") {
    // Check if we have any mutual friends
    const myFriends = await db.friendship.findMany({
      where: { userId: user.id },
      select: { friendId: true },
    });
    const myFriendIds = myFriends.map((f) => f.friendId);

    const theirFriends = await db.friendship.findMany({
      where: { userId: targetUser.id },
      select: { friendId: true },
    });
    const theirFriendIds = theirFriends.map((f) => f.friendId);

    const hasMutualFriend = myFriendIds.some((id) => theirFriendIds.includes(id));
    if (!hasMutualFriend) {
      // Silently fail - don't reveal their privacy setting
      return c.json({ success: true, message: "Friend request sent!" });
    }
  }

  // Check if already friends
  const existingFriendship = await db.friendship.findUnique({
    where: { userId_friendId: { userId: user.id, friendId: targetUser.id } },
  });

  if (existingFriendship) {
    return c.json({ success: false, message: "Already friends" });
  }

  // Check if request already exists
  const existingRequest = await db.friend_request.findFirst({
    where: {
      OR: [
        { senderId: user.id, receiverId: targetUser.id },
        { senderId: targetUser.id, receiverId: user.id },
      ],
      status: "pending",
    },
  });

  if (existingRequest) {
    // If they sent us a request, auto-accept
    if (existingRequest.senderId === targetUser.id) {
      await db.friend_request.update({
        where: { id: existingRequest.id },
        data: { status: "accepted" },
      });

      // Create bidirectional friendship
      await db.friendship.createMany({
        data: [
          { userId: user.id, friendId: targetUser.id },
          { userId: targetUser.id, friendId: user.id },
        ],
      });

      return c.json({ success: true, message: "Friend request accepted - you're now friends!" });
    }

    return c.json({ success: false, message: "Friend request already sent" });
  }

  // Create friend request
  const request = await db.friend_request.create({
    data: {
      senderId: user.id,
      receiverId: targetUser.id,
    },
    include: {
      user_friend_request_receiverIdTouser: {
        select: { id: true, name: true, email: true, image: true },
      },
    },
  });

  // Notify target user
  await db.notification.create({
    data: {
      userId: targetUser.id,
      type: "friend_request",
      title: "Friend Request",
      body: `${user.name ?? user.email} wants to be your friend`,
      data: JSON.stringify({ requestId: request.id }),
    },
  });

  return c.json({
    success: true,
    request: { ...request, createdAt: request.createdAt.toISOString() },
  });
});

// PUT /api/friends/request/:id - Accept/reject friend request
friendsRouter.put("/request/:id", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const requestId = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateFriendRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error }, 400);
  }

  // Check if request exists and is for this user
  const request = await db.friend_request.findFirst({
    where: { id: requestId, receiverId: user.id, status: "pending" },
    include: { user_friend_request_senderIdTouser: true },
  });

  if (!request) {
    return c.json({ error: "Request not found" }, 404);
  }

  await db.friend_request.update({
    where: { id: requestId },
    data: { status: parsed.data.status },
  });

  if (parsed.data.status === "accepted") {
    // Create bidirectional friendship
    const friendships = await db.$transaction([
      db.friendship.create({
        data: { userId: user.id, friendId: request.senderId },
      }),
      db.friendship.create({
        data: { userId: request.senderId, friendId: user.id },
      }),
    ]);

    // Notify sender
    await db.notification.create({
      data: {
        userId: request.senderId,
        type: "request_accepted",
        title: "Friend Request Accepted",
        body: `${user.name ?? user.email} accepted your friend request!`,
        data: JSON.stringify({ userId: user.id }),
      },
    });

    // Return the friendship ID for the accepting user (first one in the transaction)
    return c.json({
      success: true,
      friendshipId: friendships[0].id,
      user_friendship_friendIdTouser: {
        id: request.user_friend_request_senderIdTouser?.id,
        name: request.user_friend_request_senderIdTouser?.name,
        image: request.user_friend_request_senderIdTouser?.image,
      }
    });
  }

  return c.json({ success: true });
});

// DELETE /api/friends/:id - Remove friend (id is friendshipId)
friendsRouter.delete("/:id", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const friendshipId = c.req.param("id");

  // Get the friendship to find the friend
  const friendship = await db.friendship.findFirst({
    where: { id: friendshipId, userId: user.id },
  });

  if (!friendship) {
    return c.json({ error: "Friendship not found" }, 404);
  }

  // Delete both sides of the friendship
  await db.friendship.deleteMany({
    where: {
      OR: [
        { userId: user.id, friendId: friendship.friendId },
        { userId: friendship.friendId, friendId: user.id },
      ],
    },
  });

  return c.json({ success: true });
});

// PUT /api/friends/:id/block - Block/unblock friend
friendsRouter.put("/:id/block", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const friendshipId = c.req.param("id");
  const body = await c.req.json();
  const parsed = blockFriendRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error }, 400);
  }

  // Update the friendship
  const friendship = await db.friendship.updateMany({
    where: { id: friendshipId, userId: user.id },
    data: { isBlocked: parsed.data.blocked },
  });

  if (friendship.count === 0) {
    return c.json({ error: "Friendship not found" }, 404);
  }

  return c.json({ success: true });
});

// GET /api/friends/:id/events - Get friend's visible events
friendsRouter.get("/:id/events", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const friendshipId = c.req.param("id");

  // Get the friendship and verify access
  const friendship = await db.friendship.findFirst({
    where: { id: friendshipId, userId: user.id, isBlocked: false },
    include: {
      user_friendship_friendIdTouser: {
        select: { id: true, name: true, email: true, image: true, Profile: true },
      },
      friend_group_membership: true,
    },
  });

  if (!friendship) {
    return c.json({ error: "Friend not found" }, 404);
  }

  // Get friend's events that this user can see
  const groupIds = friendship.friend_group_membership.map((m) => m.groupId);

  const events = await db.event.findMany({
    where: {
      userId: friendship.friendId,
      OR: [
        { visibility: "all_friends" },
        {
          visibility: "specific_groups",
          event_group_visibility: {
            some: { groupId: { in: groupIds } },
          },
        },
      ],
    },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
      event_group_visibility: {
        include: {
          friend_group: { select: { id: true, name: true, color: true } },
        },
      },
      event_join_request: {
        where: { userId: user.id },
        include: {
          user: { select: { id: true, name: true, image: true } },
        },
      },
    },
    orderBy: { startTime: "asc" },
  });

  // Get private circle events for this friend where the viewing user is NOT in the same circle
  // These will be shown as "busy" blocks
  const privateCircleEvents = await db.circle_event.findMany({
    where: {
      isPrivate: true,
      event: {
        userId: friendship.friendId,
      },
      // Exclude circles where the viewing user is a member (they can see the actual event)
      circle: {
        circle_member: {
          none: { userId: user.id },
        },
      },
    },
    include: {
      event: {
        select: {
          id: true,
          startTime: true,
          endTime: true,
        },
      },
    },
  });

  // Create "busy" blocks from private circle events
  const busyBlocks = privateCircleEvents.map((ce) => ({
    id: `busy-${ce.event.id}`,
    title: "Busy",
    description: null,
    location: null,
    emoji: "🔒",
    startTime: ce.event.startTime.toISOString(),
    endTime: ce.event.endTime?.toISOString() ?? null,
    isRecurring: false,
    recurrence: null,
    visibility: "private",
    userId: friendship.friendId,
    createdAt: ce.event.startTime.toISOString(),
    updatedAt: ce.event.startTime.toISOString(),
    isBusyBlock: true, // Flag to identify this as a busy block
  }));

  return c.json({
    events: [
      ...events.map((e) => ({
        ...e,
        startTime: e.startTime.toISOString(),
        endTime: e.endTime?.toISOString() ?? null,
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      })),
      ...busyBlocks,
    ],
    friend: friendship.user_friendship_friendIdTouser,
  });
});

// GET /api/friends/suggestions - Get friend suggestions (people you may know)
friendsRouter.get("/suggestions", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Get blocked user IDs (both directions)
  const [blockedByMe, blockedMe] = await Promise.all([
    getBlockedUserIds(user.id),
    getBlockedByUserIds(user.id),
  ]);
  const allBlockedIds = [...new Set([...blockedByMe, ...blockedMe])];

  // Get my friends
  const myFriendships = await db.friendship.findMany({
    where: { userId: user.id },
    select: { friendId: true },
  });
  const myFriendIds = new Set(myFriendships.map((f) => f.friendId));

  // Get pending friend requests I've sent or received
  const pendingRequests = await db.friend_request.findMany({
    where: {
      OR: [{ senderId: user.id }, { receiverId: user.id }],
      status: "pending",
    },
    select: { senderId: true, receiverId: true },
  });
  const pendingUserIds = new Set(
    pendingRequests.flatMap((r) => [r.senderId, r.receiverId])
  );

  // Get friends-of-friends (potential suggestions)
  const friendsOfFriends = await db.friendship.findMany({
    where: {
      userId: { in: Array.from(myFriendIds) },
      friendId: {
        notIn: [
          user.id,
          ...Array.from(myFriendIds),
          ...Array.from(pendingUserIds),
          ...allBlockedIds,
        ],
      },
    },
    include: {
      user_friendship_friendIdTouser: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          showInFriendSuggestions: true,
          Profile: {
            select: {
              handle: true,
              bio: true,
              avatarUrl: true,
            },
          },
        },
      },
      user_friendship_userIdTouser: {
        select: {
          id: true,
          name: true,
          image: true,
        },
      },
    },
  });

  // Filter out users who have disabled showing in suggestions
  const filteredFriendsOfFriends = friendsOfFriends.filter(
    (fof) => fof.user_friendship_friendIdTouser.showInFriendSuggestions !== false
  );

  // Count mutual friends for each suggested person
  const suggestionMap: Record<
    string,
    {
      user: (typeof friendsOfFriends)[0]["user_friendship_friendIdTouser"];
      mutualFriends: Array<{ id: string; name: string | null; image: string | null }>;
    }
  > = {};

  for (const fof of filteredFriendsOfFriends) {
    const suggestedUserId = fof.friendId;
    if (!suggestionMap[suggestedUserId]) {
      suggestionMap[suggestedUserId] = {
        user: fof.user_friendship_friendIdTouser,
        mutualFriends: [],
      };
    }
    // The 'user' in this friendship is our mutual friend
    suggestionMap[suggestedUserId].mutualFriends.push({
      id: fof.user_friendship_userIdTouser.id,
      name: fof.user_friendship_userIdTouser.name,
      image: fof.user_friendship_userIdTouser.image,
    });
  }

  // Convert to array and sort by number of mutual friends
  // Map to public DTO to ensure no email/phone leaks
  const suggestions = Object.values(suggestionMap)
    .map((s) => ({
      user: toPublicUserDTO(s.user),
      mutualFriends: s.mutualFriends,
      mutualFriendCount: s.mutualFriends.length,
    }))
    .sort((a, b) => b.mutualFriendCount - a.mutualFriendCount)
    .slice(0, 20); // Limit to top 20 suggestions

  return c.json({ suggestions });
});

// GET /api/friends/:id/mutual - Get mutual friends with another user
friendsRouter.get("/:id/mutual", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const targetUserId = c.req.param("id");

  // Get my friends
  const myFriendships = await db.friendship.findMany({
    where: { userId: user.id },
    select: { friendId: true },
  });
  const myFriendIds = new Set(myFriendships.map((f) => f.friendId));

  // Get target user's friends
  const targetFriendships = await db.friendship.findMany({
    where: { userId: targetUserId },
    select: { friendId: true },
  });
  const targetFriendIds = new Set(targetFriendships.map((f) => f.friendId));

  // Find mutual friend IDs (intersection)
  const mutualFriendIds = [...myFriendIds].filter((id) => targetFriendIds.has(id));

  // Fetch mutual friend details
  const mutualFriends = await db.user.findMany({
    where: { id: { in: mutualFriendIds } },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      Profile: {
        select: {
          handle: true,
          bio: true,
          avatarUrl: true,
          calendarBio: true,
        },
      },
    },
  });

  return c.json({
    mutualFriends: mutualFriends.map((f) => ({
      ...f,
      Profile: f.Profile ?? undefined,
    })),
    count: mutualFriends.length,
  });
});

// Random profile pictures from Unsplash
const RANDOM_PROFILE_PICTURES = [
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200",
  "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200",
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200",
  "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200",
  "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=200",
  "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200",
  "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200",
  "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=200",
  "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=200",
  "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=200",
  "https://images.unsplash.com/photo-1489424731084-a5d8b219a5bb?w=200",
  "https://images.unsplash.com/photo-1463453091185-61582044d556?w=200",
  "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200",
  "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=200",
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200",
  "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200",
  "https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=200",
  "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200",
];

// POST /api/friends/add-profile-pictures - Add random profile pictures to friends who don't have one
friendsRouter.post("/add-profile-pictures", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Get all friends without profile pictures
  const friendships = await db.friendship.findMany({
    where: { userId: user.id },
    include: {
      user_friendship_friendIdTouser: {
        select: {
          id: true,
          name: true,
          image: true,
        },
      },
    },
  });

  let updatedCount = 0;
  const updates: { name: string; image: string }[] = [];

  for (const friendship of friendships) {
    // Only update friends who don't have an image
    if (!friendship.user_friendship_friendIdTouser.image) {
      const randomImage = RANDOM_PROFILE_PICTURES[updatedCount % RANDOM_PROFILE_PICTURES.length] ?? RANDOM_PROFILE_PICTURES[0];
      if (!randomImage) continue;

      // Update user image
      await db.user.update({
        where: { id: friendship.user_friendship_friendIdTouser.id },
        data: { image: randomImage },
      });

      // Also update profile avatarUrl if profile exists
      await db.profile.updateMany({
        where: { userId: friendship.user_friendship_friendIdTouser.id },
        data: { avatarUrl: randomImage },
      });

      updates.push({
        name: friendship.user_friendship_friendIdTouser.name ?? "Unknown",
        image: randomImage,
      });
      updatedCount++;
    }
  }

  return c.json({
    success: true,
    message: `Updated ${updatedCount} friend profiles with pictures`,
    updates,
  });
});

// POST /api/friends/update-all-profile-pictures - Update ALL friends with random profile pictures
friendsRouter.post("/update-all-profile-pictures", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Get all friends
  const friendships = await db.friendship.findMany({
    where: { userId: user.id },
    include: {
      user_friendship_friendIdTouser: {
        select: {
          id: true,
          name: true,
          image: true,
        },
      },
    },
  });

  let updatedCount = 0;
  const updates: { name: string; image: string }[] = [];

  for (const friendship of friendships) {
    const randomImage = RANDOM_PROFILE_PICTURES[updatedCount % RANDOM_PROFILE_PICTURES.length] ?? RANDOM_PROFILE_PICTURES[0];
    if (!randomImage) continue;

    // Update user image
    await db.user.update({
      where: { id: friendship.user_friendship_friendIdTouser.id },
      data: { image: randomImage },
    });

    // Also update profile avatarUrl if profile exists
    await db.profile.updateMany({
      where: { userId: friendship.user_friendship_friendIdTouser.id },
      data: { avatarUrl: randomImage },
    });

    updates.push({
      name: friendship.user_friendship_friendIdTouser.name ?? "Unknown",
      image: randomImage,
    });
    updatedCount++;
  }

  return c.json({
    success: true,
    message: `Updated ${updatedCount} friend profiles with pictures`,
    updates,
  });
});
