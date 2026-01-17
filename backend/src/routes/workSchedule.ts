import { Hono } from "hono";
import { db } from "../db";
import { type AppType } from "../types";

export const workScheduleRouter = new Hono<AppType>();

const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// GET /api/work-schedule - Get user's work schedule
workScheduleRouter.get("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  let schedules = await db.work_schedule.findMany({
    where: { userId: user.id },
    orderBy: { dayOfWeek: "asc" },
  });

  // If no schedules exist, create default entries for all days
  if (schedules.length === 0) {
    const defaultSchedules = DAYS_OF_WEEK.map((_, index) => ({
      userId: user.id,
      dayOfWeek: index,
      isEnabled: false,
      startTime: "09:00",
      endTime: "17:00",
      label: "Work",
    }));

    await db.work_schedule.createMany({
      data: defaultSchedules,
    });

    schedules = await db.work_schedule.findMany({
      where: { userId: user.id },
      orderBy: { dayOfWeek: "asc" },
    });
  }

  // Get or create settings
  let settings = await db.work_schedule_settings.findUnique({
    where: { userId: user.id },
  });

  if (!settings) {
    settings = await db.work_schedule_settings.create({
      data: { userId: user.id, showOnCalendar: true },
    });
  }

  return c.json({
    schedules: schedules.map((s) => ({
      id: s.id,
      dayOfWeek: s.dayOfWeek,
      dayName: DAYS_OF_WEEK[s.dayOfWeek],
      isEnabled: s.isEnabled,
      startTime: s.startTime,
      endTime: s.endTime,
      label: s.label,
    })),
    settings: {
      showOnCalendar: settings.showOnCalendar,
    },
  });
});

// PUT /api/work-schedule/settings - Update work schedule display settings
// NOTE: This route MUST be defined BEFORE /:dayOfWeek to avoid route conflicts
workScheduleRouter.put("/settings", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const { showOnCalendar } = body;

  const settings = await db.work_schedule_settings.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      showOnCalendar: showOnCalendar ?? true,
    },
    update: {
      showOnCalendar: showOnCalendar !== undefined ? showOnCalendar : undefined,
    },
  });

  return c.json({
    settings: {
      showOnCalendar: settings.showOnCalendar,
    },
  });
});

// PUT /api/work-schedule/:dayOfWeek - Update a specific day's schedule
workScheduleRouter.put("/:dayOfWeek", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const dayOfWeek = parseInt(c.req.param("dayOfWeek"));
  if (isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return c.json({ error: "Invalid day of week" }, 400);
  }

  const body = await c.req.json();
  const { isEnabled, startTime, endTime, label } = body;

  const schedule = await db.work_schedule.upsert({
    where: {
      userId_dayOfWeek: {
        userId: user.id,
        dayOfWeek,
      },
    },
    create: {
      userId: user.id,
      dayOfWeek,
      isEnabled: isEnabled ?? false,
      startTime: startTime ?? "09:00",
      endTime: endTime ?? "17:00",
      label: label ?? "Work",
    },
    update: {
      isEnabled: isEnabled !== undefined ? isEnabled : undefined,
      startTime: startTime !== undefined ? startTime : undefined,
      endTime: endTime !== undefined ? endTime : undefined,
      label: label !== undefined ? label : undefined,
    },
  });

  return c.json({
    schedule: {
      id: schedule.id,
      dayOfWeek: schedule.dayOfWeek,
      dayName: DAYS_OF_WEEK[schedule.dayOfWeek],
      isEnabled: schedule.isEnabled,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      label: schedule.label,
    },
  });
});

// PUT /api/work-schedule - Bulk update all days
workScheduleRouter.put("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const { schedules } = body as {
    schedules: Array<{
      dayOfWeek: number;
      isEnabled?: boolean;
      startTime?: string;
      endTime?: string;
      label?: string;
    }>;
  };

  if (!Array.isArray(schedules)) {
    return c.json({ error: "Invalid schedules array" }, 400);
  }

  // Update each schedule
  const updatedSchedules = await Promise.all(
    schedules.map(async (s) => {
      const schedule = await db.work_schedule.upsert({
        where: {
          userId_dayOfWeek: {
            userId: user.id,
            dayOfWeek: s.dayOfWeek,
          },
        },
        create: {
          userId: user.id,
          dayOfWeek: s.dayOfWeek,
          isEnabled: s.isEnabled ?? false,
          startTime: s.startTime ?? "09:00",
          endTime: s.endTime ?? "17:00",
          label: s.label ?? "Work",
        },
        update: {
          isEnabled: s.isEnabled !== undefined ? s.isEnabled : undefined,
          startTime: s.startTime !== undefined ? s.startTime : undefined,
          endTime: s.endTime !== undefined ? s.endTime : undefined,
          label: s.label !== undefined ? s.label : undefined,
        },
      });
      return schedule;
    })
  );

  return c.json({
    schedules: updatedSchedules.map((s) => ({
      id: s.id,
      dayOfWeek: s.dayOfWeek,
      dayName: DAYS_OF_WEEK[s.dayOfWeek],
      isEnabled: s.isEnabled,
      startTime: s.startTime,
      endTime: s.endTime,
      label: s.label,
    })),
  });
});

// GET /api/work-schedule/user/:userId - Get a specific user's work schedule (for Who's Free)
workScheduleRouter.get("/user/:userId", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const userId = c.req.param("userId");

  // Check if they're friends
  const friendship = await db.friendship.findFirst({
    where: {
      OR: [
        { userId: user.id, friendId: userId },
        { userId: userId, friendId: user.id },
      ],
      isBlocked: false,
    },
  });

  if (!friendship && userId !== user.id) {
    return c.json({ error: "Not friends" }, 403);
  }

  const schedules = await db.work_schedule.findMany({
    where: { userId },
    orderBy: { dayOfWeek: "asc" },
  });

  return c.json({
    schedules: schedules.map((s) => ({
      dayOfWeek: s.dayOfWeek,
      dayName: DAYS_OF_WEEK[s.dayOfWeek],
      isEnabled: s.isEnabled,
      startTime: s.startTime,
      endTime: s.endTime,
      label: s.label,
    })),
  });
});

// GET /api/work-schedule/check - Check if user is busy on a specific date
workScheduleRouter.get("/check", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const dateStr = c.req.query("date");
  if (!dateStr) {
    return c.json({ error: "Date required" }, 400);
  }

  const date = new Date(dateStr);
  const dayOfWeek = date.getDay();

  const schedule = await db.work_schedule.findUnique({
    where: {
      userId_dayOfWeek: {
        userId: user.id,
        dayOfWeek,
      },
    },
  });

  const isWorking = schedule?.isEnabled ?? false;

  return c.json({
    date: dateStr,
    dayOfWeek,
    dayName: DAYS_OF_WEEK[dayOfWeek],
    isWorking,
    schedule: schedule
      ? {
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          label: schedule.label,
        }
      : null,
  });
});
