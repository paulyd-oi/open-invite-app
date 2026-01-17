import { Hono } from "hono";
import { db } from "../db";
import { type AppType } from "../types";

export const onboardingRouter = new Hono<AppType>();

// GET /api/onboarding/status - Check if user has completed onboarding
onboardingRouter.get("/status", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { onboardingCompleted: true },
  });

  return c.json({
    completed: dbUser?.onboardingCompleted ?? false,
  });
});

// POST /api/onboarding/complete - Mark onboarding as complete
onboardingRouter.post("/complete", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await db.user.update({
    where: { id: user.id },
    data: { onboardingCompleted: true },
  });

  return c.json({ success: true });
});

// GET /api/onboarding/checklist - Get getting started checklist status
onboardingRouter.get("/checklist", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Check various completion statuses
  const [
    profile,
    friendCount,
    eventCount,
    workScheduleCount,
  ] = await Promise.all([
    db.profile.findUnique({ where: { userId: user.id } }),
    db.friendship.count({ where: { userId: user.id } }),
    db.event.count({ where: { userId: user.id } }),
    db.work_schedule.count({ where: { userId: user.id, isEnabled: true } }),
  ]);

  const checklist = [
    {
      id: "profile",
      title: "Complete your profile",
      description: "Add your name and calendar bio",
      completed: !!(profile?.handle && profile?.calendarBio),
      route: "/profile",
    },
    {
      id: "friends",
      title: "Add your first friend",
      description: "Connect with friends to share events",
      completed: friendCount > 0,
      route: "/friends",
    },
    {
      id: "event",
      title: "Create your first event",
      description: "Share what you're up to",
      completed: eventCount > 0,
      route: "/create",
    },
    {
      id: "schedule",
      title: "Set your work schedule",
      description: "Let friends know when you're busy",
      completed: workScheduleCount > 0,
      route: "/settings",
    },
  ];

  const completedCount = checklist.filter((item) => item.completed).length;
  const allCompleted = completedCount === checklist.length;

  return c.json({
    checklist,
    completedCount,
    totalCount: checklist.length,
    allCompleted,
  });
});
