import { Hono } from "hono";
import { db } from "../db";
import { type AppType } from "../types";
import {
  createGroupRequestSchema,
  updateGroupRequestSchema,
  addGroupMemberRequestSchema,
} from "../shared/contracts";

export const groupsRouter = new Hono<AppType>();

// Helper to serialize group
const serializeGroup = (group: {
  id: string;
  name: string;
  color: string;
  icon: string;
  userId: string;
  createdAt: Date;
  friend_group_membership?: Array<{
    friendshipId: string;
    friendship?: {
      user_friendship_friendIdTouser: {
        id: string;
        name: string | null;
        email: string | null;
        image: string | null;
      };
    };
  }>;
}) => {
  const { friend_group_membership, ...rest } = group;
  return {
    ...rest,
    createdAt: group.createdAt.toISOString(),
    memberships: (friend_group_membership ?? []).map((m) => ({
      friendshipId: m.friendshipId,
      friendship: m.friendship ? {
        friend: m.friendship.user_friendship_friendIdTouser,
      } : undefined,
    })),
  };
};

// GET /api/groups - Get all friend groups
groupsRouter.get("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const groups = await db.friend_group.findMany({
    where: { userId: user.id },
    include: {
      friend_group_membership: {
        include: {
          friendship: {
            include: {
              user_friendship_friendIdTouser: {
                select: { id: true, name: true, email: true, image: true },
              },
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return c.json({ groups: groups.map(serializeGroup) });
});

// POST /api/groups - Create friend group
groupsRouter.post("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const parsed = createGroupRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error }, 400);
  }

  // Check if group name already exists for this user
  const existingGroup = await db.friend_group.findFirst({
    where: { userId: user.id, name: parsed.data.name },
  });

  if (existingGroup) {
    return c.json({ error: "Group with this name already exists" }, 400);
  }

  const group = await db.friend_group.create({
    data: {
      name: parsed.data.name,
      color: parsed.data.color ?? "#FF6B4A",
      icon: parsed.data.icon ?? "users",
      userId: user.id,
    },
  });

  return c.json({ group: serializeGroup(group) });
});

// PUT /api/groups/:id - Update friend group
groupsRouter.put("/:id", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const groupId = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateGroupRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error }, 400);
  }

  // Check if user owns the group
  const existingGroup = await db.friend_group.findFirst({
    where: { id: groupId, userId: user.id },
  });

  if (!existingGroup) {
    return c.json({ error: "Group not found" }, 404);
  }

  // Check if new name conflicts
  if (parsed.data.name && parsed.data.name !== existingGroup.name) {
    const nameConflict = await db.friend_group.findFirst({
      where: { userId: user.id, name: parsed.data.name },
    });
    if (nameConflict) {
      return c.json({ error: "Group with this name already exists" }, 400);
    }
  }

  const group = await db.friend_group.update({
    where: { id: groupId },
    data: parsed.data,
    include: {
      friend_group_membership: {
        include: {
          friendship: {
            include: {
              user_friendship_friendIdTouser: {
                select: { id: true, name: true, email: true, image: true },
              },
            },
          },
        },
      },
    },
  });

  return c.json({ group: serializeGroup(group) });
});

// DELETE /api/groups/:id - Delete friend group
groupsRouter.delete("/:id", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const groupId = c.req.param("id");

  // Check if user owns the group
  const existingGroup = await db.friend_group.findFirst({
    where: { id: groupId, userId: user.id },
  });

  if (!existingGroup) {
    return c.json({ error: "Group not found" }, 404);
  }

  await db.friend_group.delete({ where: { id: groupId } });

  return c.json({ success: true });
});

// POST /api/groups/:id/members - Add friend to group
groupsRouter.post("/:id/members", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const groupId = c.req.param("id");
  const body = await c.req.json();
  const parsed = addGroupMemberRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error }, 400);
  }

  // Check if user owns the group
  const group = await db.friend_group.findFirst({
    where: { id: groupId, userId: user.id },
  });

  if (!group) {
    return c.json({ error: "Group not found" }, 404);
  }

  // Check if friendship exists and belongs to user
  const friendship = await db.friendship.findFirst({
    where: { id: parsed.data.friendshipId, userId: user.id },
  });

  if (!friendship) {
    return c.json({ error: "Friendship not found" }, 404);
  }

  // Check if already in group
  const existingMembership = await db.friend_group_membership.findUnique({
    where: {
      friendshipId_groupId: {
        friendshipId: parsed.data.friendshipId,
        groupId,
      },
    },
  });

  if (existingMembership) {
    return c.json({ error: "Friend already in group" }, 400);
  }

  await db.friend_group_membership.create({
    data: {
      friendshipId: parsed.data.friendshipId,
      groupId,
    },
  });

  return c.json({ success: true });
});

// DELETE /api/groups/:id/members/:friendshipId - Remove friend from group
groupsRouter.delete("/:id/members/:friendshipId", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const groupId = c.req.param("id");
  const friendshipId = c.req.param("friendshipId");

  // Check if user owns the group
  const group = await db.friend_group.findFirst({
    where: { id: groupId, userId: user.id },
  });

  if (!group) {
    return c.json({ error: "Group not found" }, 404);
  }

  await db.friend_group_membership.deleteMany({
    where: { friendshipId, groupId },
  });

  return c.json({ success: true });
});
