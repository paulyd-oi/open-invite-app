import { Hono } from "hono";
import { db } from "../db";
import { type AppType } from "../types";

export const profilesRouter = new Hono<AppType>();

// ============================================
// Profile Routes (Personal Only)
// ============================================

// GET /api/profiles - Get user's personal profile only
profilesRouter.get("/", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const userData = await db.user.findUnique({
    where: { id: user.id },
    include: { Profile: true },
  });

  if (!userData) {
    return c.json({ error: "User not found" }, 404);
  }

  // Personal profile only
  const personalProfile = {
    type: "personal" as const,
    id: userData.id,
    name: userData.name,
    email: userData.email,
    image: userData.image,
    handle: userData.Profile?.handle,
    bio: userData.Profile?.bio,
    calendarBio: userData.Profile?.calendarBio,
  };

  return c.json({
    profiles: [personalProfile],
    activeProfile: personalProfile,
  });
});

// POST /api/profiles/switch - No-op (always personal profile)
profilesRouter.post("/switch", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  // Always return personal profile
  return c.json({ success: true, activeProfileId: user.id });
});

// GET /api/profiles/active - Get active profile (always personal)
profilesRouter.get("/active", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const userData = await db.user.findUnique({
    where: { id: user.id },
    include: { Profile: true },
  });

  return c.json({
    type: "personal",
    id: userData?.id || user.id,
    name: userData?.name || user.name,
    email: userData?.email || user.email,
    image: userData?.image,
    handle: userData?.Profile?.handle,
  });
});
