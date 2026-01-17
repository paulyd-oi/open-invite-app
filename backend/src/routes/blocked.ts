import { Hono } from "hono";
import { db } from "../db";
import { type AppType } from "../types";
import { blockContactRequestSchema, searchToBlockRequestSchema } from "../shared/contracts";

export const blockedRouter = new Hono<AppType>();

// GET /api/blocked - Get all blocked contacts
blockedRouter.get("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const blockedContacts = await db.blocked_contact.findMany({
    where: { userId: user.id },
    include: {
      user_blocked_contact_blockedUserIdTouser: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return c.json({ blockedContacts });
});

// POST /api/blocked - Block a user or identifier
blockedRouter.post("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const parsed = blockContactRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error }, 400);
  }

  const { userId: blockedUserId, email, phone, reason } = parsed.data;

  // Check if blocking self
  if (blockedUserId === user.id) {
    return c.json({ error: "Cannot block yourself" }, 400);
  }

  try {
    // Check if already blocked
    if (blockedUserId) {
      const existingBlock = await db.blocked_contact.findUnique({
        where: { userId_blockedUserId: { userId: user.id, blockedUserId } },
      });
      if (existingBlock) {
        return c.json({ success: false, message: "User already blocked" });
      }
    }
    if (email) {
      // Check if email matches current user
      if (email.toLowerCase() === user.email.toLowerCase()) {
        return c.json({ error: "Cannot block yourself" }, 400);
      }
      const existingBlock = await db.blocked_contact.findUnique({
        where: { userId_blockedEmail: { userId: user.id, blockedEmail: email.toLowerCase() } },
      });
      if (existingBlock) {
        return c.json({ success: false, message: "Email already blocked" });
      }
    }
    if (phone) {
      const existingBlock = await db.blocked_contact.findUnique({
        where: { userId_blockedPhone: { userId: user.id, blockedPhone: phone } },
      });
      if (existingBlock) {
        return c.json({ success: false, message: "Phone number already blocked" });
      }
    }

    // If blocking by email or phone, check if a user exists with that identifier
    let userToBlock: string | undefined = blockedUserId;
    let emailToBlock: string | undefined = email?.toLowerCase();
    let phoneToBlock: string | undefined = phone;

    if (!blockedUserId && (email || phone)) {
      const foundUser = await db.user.findFirst({
        where: {
          OR: [
            ...(email ? [{ email: email.toLowerCase() }] : []),
            ...(phone ? [{ phone }] : []),
          ],
        },
      });
      if (foundUser) {
        userToBlock = foundUser.id;
        // Clear the email/phone since we're blocking by userId now
        emailToBlock = undefined;
        phoneToBlock = undefined;
      }
    }

    // Create the block
    const blockedContact = await db.blocked_contact.create({
      data: {
        userId: user.id,
        blockedUserId: userToBlock,
        blockedEmail: emailToBlock,
        blockedPhone: phoneToBlock,
        reason,
      },
      include: {
        user_blocked_contact_blockedUserIdTouser: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    // If blocking a user, also:
    // 1. Remove any friendship between them
    // 2. Remove any pending friend requests
    // 3. Remove any event join requests from blocked user
    if (userToBlock) {
      // Remove friendships (both directions)
      await db.friendship.deleteMany({
        where: {
          OR: [
            { userId: user.id, friendId: userToBlock },
            { userId: userToBlock, friendId: user.id },
          ],
        },
      });

      // Remove friend requests (both directions)
      await db.friend_request.deleteMany({
        where: {
          OR: [
            { senderId: user.id, receiverId: userToBlock },
            { senderId: userToBlock, receiverId: user.id },
          ],
        },
      });

      // Remove event join requests from blocked user on user's events
      await db.event_join_request.deleteMany({
        where: {
          userId: userToBlock,
          event: { userId: user.id },
        },
      });
    }

    return c.json({
      success: true,
      blockedContact,
      message: userToBlock
        ? "User blocked successfully"
        : email
        ? "Email blocked successfully"
        : "Phone number blocked successfully",
    });
  } catch (error) {
    console.error("Error blocking contact:", error);
    return c.json({ error: "Failed to block contact" }, 500);
  }
});

// DELETE /api/blocked/:id - Unblock a contact
blockedRouter.delete("/:id", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { id } = c.req.param();

  const blockedContact = await db.blocked_contact.findUnique({
    where: { id },
  });

  if (!blockedContact) {
    return c.json({ error: "Blocked contact not found" }, 404);
  }

  if (blockedContact.userId !== user.id) {
    return c.json({ error: "Unauthorized" }, 403);
  }

  await db.blocked_contact.delete({
    where: { id },
  });

  return c.json({ success: true });
});

// POST /api/blocked/search - Search for users to block
blockedRouter.post("/search", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const parsed = searchToBlockRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error }, 400);
  }

  const query = parsed.data.query.toLowerCase();

  // Get list of already blocked user IDs
  const blockedContacts = await db.blocked_contact.findMany({
    where: { userId: user.id, blockedUserId: { not: null } },
    select: { blockedUserId: true },
  });
  const blockedUserIds = blockedContacts
    .map(b => b.blockedUserId)
    .filter((id): id is string => id !== null);

  const users = await db.user.findMany({
    where: {
      AND: [
        { id: { not: user.id } }, // Exclude current user
        { id: { notIn: blockedUserIds } }, // Exclude already blocked users
        {
          OR: [
            { email: { contains: query } },
            { name: { contains: query } },
            { Profile: { handle: { contains: query } } },
          ],
        },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      Profile: true,
    },
    take: 20,
  });

  return c.json({ users });
});

// Helper function to check if a user is blocked (export for use in other routes)
export async function isUserBlocked(blockerId: string, blockedId: string): Promise<boolean> {
  const block = await db.blocked_contact.findUnique({
    where: { userId_blockedUserId: { userId: blockerId, blockedUserId: blockedId } },
  });
  return !!block;
}

// Helper function to get all blocked user IDs for a user
export async function getBlockedUserIds(userId: string): Promise<string[]> {
  const blockedContacts = await db.blocked_contact.findMany({
    where: { userId, blockedUserId: { not: null } },
    select: { blockedUserId: true },
  });
  return blockedContacts
    .map(b => b.blockedUserId)
    .filter((id): id is string => id !== null);
}

// Helper function to get all user IDs that have blocked this user
export async function getBlockedByUserIds(userId: string): Promise<string[]> {
  const blockedBy = await db.blocked_contact.findMany({
    where: { blockedUserId: userId },
    select: { userId: true },
  });
  return blockedBy.map(b => b.userId);
}

// Helper function to check if an email or phone is blocked
export async function isIdentifierBlocked(
  userId: string,
  email?: string,
  phone?: string
): Promise<boolean> {
  if (email) {
    const block = await db.blocked_contact.findUnique({
      where: { userId_blockedEmail: { userId, blockedEmail: email.toLowerCase() } },
    });
    if (block) return true;
  }
  if (phone) {
    const block = await db.blocked_contact.findUnique({
      where: { userId_blockedPhone: { userId, blockedPhone: phone } },
    });
    if (block) return true;
  }
  return false;
}
