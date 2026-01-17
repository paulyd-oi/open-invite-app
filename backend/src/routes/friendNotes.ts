import { Hono } from "hono";
import { db } from "../db";
import { type AppType } from "../types";
import { canCreateFriendNote } from "../utils/subscriptionHelpers";

export const friendNotesRouter = new Hono<AppType>();

// GET /api/friends/:friendshipId/notes - Get all notes for a friend
friendNotesRouter.get("/:friendshipId/notes", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const friendshipId = c.req.param("friendshipId");

  // Verify the friendship belongs to this user
  const friendship = await db.friendship.findFirst({
    where: {
      id: friendshipId,
      userId: user.id,
    },
  });

  if (!friendship) {
    return c.json({ error: "Friendship not found" }, 404);
  }

  const notes = await db.friend_note.findMany({
    where: { friendshipId },
    orderBy: { createdAt: "asc" },
  });

  return c.json({
    notes: notes.map((n) => ({
      id: n.id,
      content: n.content,
      createdAt: n.createdAt.toISOString(),
    })),
  });
});

// POST /api/friends/:friendshipId/notes - Add a new note
friendNotesRouter.post("/:friendshipId/notes", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const friendshipId = c.req.param("friendshipId");
  const body = await c.req.json();
  const { content } = body;

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return c.json({ error: "Content is required" }, 400);
  }

  // Check friend notes limit (FREE: 5 total notes)
  const noteLimit = await canCreateFriendNote(user.id);
  if (!noteLimit.allowed) {
    return c.json({
      error: "Friend notes limit reached",
      message: `Free accounts can have up to ${noteLimit.limit} friend notes. Upgrade to Pro for unlimited notes.`,
      limit: noteLimit.limit,
      current: noteLimit.current,
      requiresUpgrade: true,
    }, 403);
  }

  // Verify the friendship belongs to this user
  const friendship = await db.friendship.findFirst({
    where: {
      id: friendshipId,
      userId: user.id,
    },
  });

  if (!friendship) {
    return c.json({ error: "Friendship not found" }, 404);
  }

  const note = await db.friend_note.create({
    data: {
      friendshipId,
      content: content.trim(),
    },
  });

  return c.json({
    note: {
      id: note.id,
      content: note.content,
      createdAt: note.createdAt.toISOString(),
    },
  });
});

// PUT /api/friends/:friendshipId/notes/:noteId - Update a note
friendNotesRouter.put("/:friendshipId/notes/:noteId", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const friendshipId = c.req.param("friendshipId");
  const noteId = c.req.param("noteId");
  const body = await c.req.json();
  const { content } = body;

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return c.json({ error: "Content is required" }, 400);
  }

  // Verify the friendship belongs to this user
  const friendship = await db.friendship.findFirst({
    where: {
      id: friendshipId,
      userId: user.id,
    },
  });

  if (!friendship) {
    return c.json({ error: "Friendship not found" }, 404);
  }

  // Verify the note exists and belongs to this friendship
  const existingNote = await db.friend_note.findFirst({
    where: {
      id: noteId,
      friendshipId,
    },
  });

  if (!existingNote) {
    return c.json({ error: "Note not found" }, 404);
  }

  const note = await db.friend_note.update({
    where: { id: noteId },
    data: { content: content.trim() },
  });

  return c.json({
    note: {
      id: note.id,
      content: note.content,
      createdAt: note.createdAt.toISOString(),
    },
  });
});

// DELETE /api/friends/:friendshipId/notes/:noteId - Delete a note
friendNotesRouter.delete("/:friendshipId/notes/:noteId", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const friendshipId = c.req.param("friendshipId");
  const noteId = c.req.param("noteId");

  // Verify the friendship belongs to this user
  const friendship = await db.friendship.findFirst({
    where: {
      id: friendshipId,
      userId: user.id,
    },
  });

  if (!friendship) {
    return c.json({ error: "Friendship not found" }, 404);
  }

  // Verify the note exists and belongs to this friendship
  const existingNote = await db.friend_note.findFirst({
    where: {
      id: noteId,
      friendshipId,
    },
  });

  if (!existingNote) {
    return c.json({ error: "Note not found" }, 404);
  }

  await db.friend_note.delete({
    where: { id: noteId },
  });

  return c.json({ success: true });
});
