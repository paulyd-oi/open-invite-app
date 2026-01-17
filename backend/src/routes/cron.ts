/**
 * Cron Routes - v2.9
 * Scheduled job endpoints for cleanup and maintenance tasks
 *
 * All endpoints require X-Cron-Secret header for authentication
 *
 * Routes:
 * - POST /api/cron/reminders/run    - Send event reminders
 * - POST /api/cron/digest/run       - Send daily digest
 * - POST /api/cron/cleanup/tokens   - Deactivate/delete stale push tokens
 * - POST /api/cron/cleanup/dedupe   - Delete old notification delivery logs
 * - POST /api/cron/cleanup/sessions - Delete expired sessions
 * - POST /api/cron/tokens/cleanup   - Alias for token cleanup
 * - POST /api/cron/notifications/dedupe/cleanup - Alias for dedupe cleanup
 * - GET  /api/cron/health           - Health check (validates CRON_SECRET)
 *
 * Render Cron Configuration:
 * - Reminders:       Every 5 minutes
 * - Digest:          Every 15 minutes
 * - Token cleanup:   Weekly, Monday 08:00 UTC
 *
 * Idempotency:
 * - Reminders/Digest use notification_delivery_log with unique (userId, dedupeKey)
 * - Dedupe key format prevents duplicate sends within the same window
 * - Jobs acquire run-level lock via cron_job_lock table to prevent overlapping executions
 *
 * Standard Response Shape:
 * {
 *   ok: boolean,
 *   job: string,             // Job identifier
 *   timestamp: string,       // ISO 8601 UTC
 *   durationMs: number,      // Execution time
 *   buildId?: string,        // Optional deployment ID
 *   processed?: number,      // Items processed
 *   sent?: number,           // Notifications sent
 *   skipped?: object,        // Breakdown of skipped items
 *   error?: string           // Error code on failure
 * }
 */

import { Hono } from "hono";
import { db } from "../db";
import { cronAuth } from "../middleware/cronAuth";
import { sendExpoPush, type ExpoPushMessage } from "../lib/expoPush";

// ============================================
// Types & Constants
// ============================================

interface CronJobResult {
  ok: boolean;
  job: string;
  ts: string;
  durationMs: number;
  buildId?: string;
  error?: string;
  [key: string]: unknown;
}

const BUILD_ID = process.env.RENDER_GIT_COMMIT?.slice(0, 7) || process.env.NODE_ENV || "dev";

// Lease durations (TTL) - based on worst-case job duration
const LEASE_TTL_MS = {
  reminders: 3 * 60 * 1000, // 3 minutes
  digest: 5 * 60 * 1000, // 5 minutes
  token_cleanup: 2 * 60 * 1000, // 2 minutes
  dedupe_cleanup: 2 * 60 * 1000, // 2 minutes
  session_cleanup: 2 * 60 * 1000, // 2 minutes
};

// ============================================
// Helper: Standard Response Builder
// ============================================

function buildResponse(
  job: string,
  startTime: number,
  data: Record<string, unknown> = {}
): CronJobResult {
  return {
    ok: true,
    job,
    ts: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    buildId: BUILD_ID,
    ...data,
  };
}

function buildErrorResponse(
  job: string,
  startTime: number,
  error: string
): CronJobResult {
  return {
    ok: false,
    job,
    ts: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    buildId: BUILD_ID,
    error,
  };
}

// ============================================
// Helper: Lease-based Job Lock
// ============================================

/**
 * Generate a unique owner ID for this run instance
 * Format: timestamp-random to ensure uniqueness and debuggability
 */
function generateOwnerId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 9);
  return `${timestamp}-${random}`;
}

/**
 * Generate a CUID-like ID for database records
 */
function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 11);
  return `cron_${timestamp}${random}`;
}

/**
 * Acquire a lease for a cron job to prevent overlapping executions.
 * Uses atomic INSERT ... ON CONFLICT with RETURNING for reliable acquisition signal.
 *
 * PostgreSQL Atomicity:
 * - INSERT succeeds if no row exists → acquired
 * - ON CONFLICT triggers if row exists:
 *   - DO UPDATE with WHERE succeeds if lease expired → acquired (row returned)
 *   - DO UPDATE with WHERE fails if lease active → not acquired (no row returned)
 *
 * Returns: { acquired: true, ownerId: string } or { acquired: false, reason: string }
 */
async function acquireJobLease(
  jobName: string,
  ttlMs: number
): Promise<{ acquired: boolean; ownerId?: string; reason?: string }> {
  const ownerId = generateOwnerId();
  const newId = generateId();
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + ttlMs);

  try {
    // Atomic operation with RETURNING to get definitive acquisition signal
    // If we get a row back, we acquired the lease
    // If we get empty array, lease is held by another process
    const result = await db.$queryRaw<Array<{ id: string; ownerId: string }>>`
      INSERT INTO "cron_job_lease" ("id", "jobName", "ownerId", "lockedUntil", "acquiredAt")
      VALUES (${newId}, ${jobName}, ${ownerId}, ${lockedUntil}::timestamp, ${now}::timestamp)
      ON CONFLICT ("jobName") DO UPDATE
      SET "ownerId" = ${ownerId},
          "lockedUntil" = ${lockedUntil}::timestamp,
          "acquiredAt" = ${now}::timestamp
      WHERE "cron_job_lease"."lockedUntil" < ${now}::timestamp
      RETURNING "id", "ownerId"
    `;

    // RETURNING gives us definitive signal: got row = acquired, empty = blocked
    if (!result || result.length === 0) {
      // Lease is held by another process - get details for logging
      const currentLease = await db.cron_job_lease.findUnique({
        where: { jobName },
        select: { ownerId: true, lockedUntil: true },
      });

      if (currentLease) {
        const remainingMs = Math.max(0, currentLease.lockedUntil.getTime() - now.getTime());
        console.log(
          `[CronLease] ${jobName}: BLOCKED by ${currentLease.ownerId} (expires in ${Math.round(remainingMs / 1000)}s)`
        );
      }

      return { acquired: false, reason: "LEASE_HELD" };
    }

    // Verify we got our ownerId back (sanity check)
    const acquiredOwnerId = result[0]?.ownerId;
    if (acquiredOwnerId !== ownerId) {
      console.warn(`[CronLease] ${jobName}: UNEXPECTED ownerId mismatch: expected=${ownerId}, got=${acquiredOwnerId}`);
      return { acquired: false, reason: "OWNER_MISMATCH" };
    }

    console.log(`[CronLease] ${jobName}: ACQUIRED (ownerId=${ownerId}, ttl=${ttlMs}ms)`);
    return { acquired: true, ownerId };
  } catch (error: any) {
    console.error(`[CronLease] ${jobName}: ERROR acquiring lease`, error?.message);
    // Check for specific Postgres errors
    if (error?.code === "42P01") {
      // Table doesn't exist - fail open for development
      console.warn(`[CronLease] ${jobName}: Table missing, proceeding without lock`);
      return { acquired: true, ownerId: "no-lease-table" };
    }
    // For production: fail CLOSED to prevent duplicate sends
    // Change to fail-open only if you prefer availability over correctness
    return { acquired: false, reason: "LEASE_ERROR" };
  }
}

/**
 * Release a lease early (before TTL expires)
 * Only releases if we still own the lease (scoped by ownerId)
 */
async function releaseJobLease(jobName: string, ownerId: string): Promise<void> {
  // Skip release for synthetic/fallback ownerIds
  if (!ownerId || ownerId === "no-lease-table" || ownerId === "error-fallback") return;

  try {
    // Atomic delete scoped by both jobName AND ownerId
    // This prevents accidentally releasing another process's lease
    const result = await db.cron_job_lease.deleteMany({
      where: {
        jobName,
        ownerId,
      },
    });

    if (result.count > 0) {
      console.log(`[CronLease] ${jobName}: RELEASED (ownerId=${ownerId})`);
    } else {
      // Lease was already released or taken over - not an error
      console.log(`[CronLease] ${jobName}: RELEASE_NOOP (ownerId=${ownerId}, lease already gone or taken over)`);
    }
  } catch (error: any) {
    // Log but don't throw - release is best-effort
    console.error(`[CronLease] ${jobName}: ERROR releasing lease`, error?.message);
  }
}

/**
 * Extend lease TTL if job is taking longer than expected
 */
async function extendJobLease(
  jobName: string,
  ownerId: string,
  additionalMs: number
): Promise<boolean> {
  if (ownerId === "no-lease-table" || ownerId === "error-fallback") return true;

  try {
    const newLockedUntil = new Date(Date.now() + additionalMs);
    const result = await db.cron_job_lease.updateMany({
      where: {
        jobName,
        ownerId,
      },
      data: {
        lockedUntil: newLockedUntil,
      },
    });
    return result.count > 0;
  } catch {
    return false;
  }
}

export const cronRouter = new Hono();

// Apply cron authentication to all routes
cronRouter.use("/*", cronAuth);

// ============================================
// Helper Functions
// ============================================

/**
 * Get offset label for reminder notification body
 */
function getOffsetLabel(minutes: number): string {
  if (minutes >= 1440) {
    const days = Math.floor(minutes / 1440);
    return days === 1 ? "Tomorrow" : `In ${days} days`;
  }
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return hours === 1 ? "In 1 hour" : `In ${hours} hours`;
  }
  return `In ${minutes} minutes`;
}

/**
 * Get current time in user's timezone
 * Returns { localHour, localMinute, localMinutes, localDayOfWeek, localDateString }
 *
 * Uses Intl.DateTimeFormat for reliable timezone conversion.
 * Handles edge cases: invalid timezone falls back to UTC.
 *
 * IMPORTANT: localDateString is YYYY-MM-DD in the user's local timezone,
 * NOT server UTC. This is critical for digest dedupe correctness.
 */
function getUserLocalTime(timezone: string): {
  localHour: number;
  localMinute: number;
  localMinutes: number;
  localDayOfWeek: string;
  localDateString: string;
} {
  // Validate timezone is a non-empty string
  const tz = timezone?.trim() || "UTC";

  try {
    const now = new Date();

    // Use separate formatters to avoid locale-specific ordering issues
    // and handle hour12:false edge cases (some locales return "24" for midnight)
    const dateFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    const timeFormatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
    });

    // en-CA gives us YYYY-MM-DD format directly
    const localDateString = dateFormatter.format(now);

    // en-GB with hour12:false gives HH:MM format
    const timeStr = timeFormatter.format(now);
    const [hourStr, minuteStr] = timeStr.split(":");
    let localHour = parseInt(hourStr || "0", 10);
    const localMinute = parseInt(minuteStr || "0", 10);

    // Handle edge case where some locales return "24:00" for midnight
    if (localHour === 24) localHour = 0;

    // Get weekday
    const weekdayStr = weekdayFormatter.format(now);
    const weekdayMap: Record<string, string> = {
      Sun: "SUN", Mon: "MON", Tue: "TUE", Wed: "WED",
      Thu: "THU", Fri: "FRI", Sat: "SAT",
    };
    const localDayOfWeek = weekdayMap[weekdayStr] || "MON";

    return {
      localHour,
      localMinute,
      localMinutes: localHour * 60 + localMinute,
      localDayOfWeek,
      localDateString,
    };
  } catch (error) {
    // Invalid timezone - fall back to UTC
    console.warn(`[getUserLocalTime] Invalid timezone "${tz}", falling back to UTC`);
    const now = new Date();
    const dayNames: string[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    const dayIndex = now.getUTCDay();

    // Compute UTC date string manually (not via toISOString which may have issues)
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    const day = String(now.getUTCDate()).padStart(2, "0");
    const utcDateString = `${year}-${month}-${day}`;

    return {
      localHour: now.getUTCHours(),
      localMinute: now.getUTCMinutes(),
      localMinutes: now.getUTCHours() * 60 + now.getUTCMinutes(),
      localDayOfWeek: dayNames[dayIndex] ?? "MON",
      localDateString: utcDateString,
    };
  }
}

/**
 * Check if current time is within quiet hours for a user
 */
function isInQuietHours(
  prefs: { quietHoursEnabled: boolean; quietHoursStart: string; quietHoursEnd: string },
  timezone: string
): boolean {
  if (!prefs.quietHoursEnabled) return false;

  const { localHour, localMinute } = getUserLocalTime(timezone);
  const currentTime = `${String(localHour).padStart(2, "0")}:${String(localMinute).padStart(2, "0")}`;

  const start = prefs.quietHoursStart || "22:00";
  const end = prefs.quietHoursEnd || "08:00";

  // Handle overnight quiet hours (e.g., 22:00 to 08:00)
  if (start > end) {
    return currentTime >= start || currentTime < end;
  }

  // Handle same-day quiet hours (e.g., 13:00 to 14:00)
  return currentTime >= start && currentTime < end;
}

/**
 * Parse comma-separated reminder offsets string to array of numbers
 */
function parseReminderOffsets(offsetsStr: string): number[] {
  if (!offsetsStr) return [30, 120, 1440]; // Default offsets
  return offsetsStr
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0);
}

/**
 * Parse comma-separated digest days string to array
 */
function parseDigestDays(daysStr: string): string[] {
  if (!daysStr) return ["MON", "TUE", "WED", "THU", "FRI"];
  return daysStr.split(",").map((s) => s.trim().toUpperCase());
}

/**
 * Parse digest time string (HH:MM) to minutes since midnight
 */
function parseDigestTimeMinutes(timeStr: string): number {
  if (!timeStr) return 9 * 60; // Default 09:00
  const [hours, minutes] = timeStr.split(":").map((s) => parseInt(s, 10));
  return (hours || 0) * 60 + (minutes || 0);
}

// ============================================
// Reminders Runner
// ============================================

/**
 * POST /api/cron/reminders/run
 *
 * Find upcoming events that need reminders and send notifications.
 * Runs every 5 minutes via Render Cron.
 *
 * Idempotency:
 * - Job-level lock prevents overlapping executions
 * - Per-notification dedupe via notification_delivery_log unique constraint
 * - Run key based on 5-minute time window ensures retries are safe
 *
 * Logic:
 * 1. Acquire job lock with time-window-based run key
 * 2. Query events starting within reminder windows (30, 120, 1440 min)
 * 3. For each event, get attendees (host + accepted join requests)
 * 4. For each attendee, check their preferences and send reminder if:
 *    - eventReminders enabled
 *    - Not already sent (dedupe check)
 * 5. Always create in-app notification
 * 6. Send push only if allowed (not quiet hours, has token, permission granted)
 * 7. Release job lease
 */
cronRouter.post("/reminders/run", async (c) => {
  const JOB_NAME = "reminders";
  const startTime = Date.now();

  console.log(`[Cron] ${JOB_NAME}: START`);

  // Acquire lease to prevent overlapping executions
  const lease = await acquireJobLease(JOB_NAME, LEASE_TTL_MS.reminders);
  if (!lease.acquired) {
    console.log(`[Cron] ${JOB_NAME}: SKIPPED (${lease.reason})`);
    return c.json(
      buildResponse(JOB_NAME, startTime, {
        skipped: true,
        reason: lease.reason,
        metrics: {},
      })
    );
  }

  const now = new Date();
  const metrics = {
    processed: 0,
    sent: {
      inApp: 0,
      push: 0,
    },
    skipped: {
      dedupe: 0,
      prefs: 0,
      quietHours: 0,
      noToken: 0,
    },
  };

  let success = true;

  try {
    // Standard reminder offsets to check (in minutes)
    const reminderOffsets = [30, 120, 1440];

    // For each offset, find events starting in that window
    for (const offsetMinutes of reminderOffsets) {
      // Window: events starting between (offset - 2.5min) and (offset + 2.5min) from now
      // This 5-minute window matches the cron interval
      const windowStart = new Date(now.getTime() + (offsetMinutes - 2.5) * 60 * 1000);
      const windowEnd = new Date(now.getTime() + (offsetMinutes + 2.5) * 60 * 1000);

      const events = await db.event.findMany({
        where: {
          startTime: {
            gte: windowStart,
            lt: windowEnd,
          },
        },
        include: {
          user: {
            select: { id: true, name: true, pushPermissionStatus: true },
          },
          event_join_request: {
            where: { status: "accepted" },
            select: {
              user: {
                select: { id: true, name: true, pushPermissionStatus: true },
              },
            },
          },
        },
      });

      for (const event of events) {
        // Build recipient list: host + accepted attendees
        const recipients: Array<{ id: string; name: string | null; pushPermissionStatus: string }> =
          [];

        // Add host
        recipients.push(event.user);

        // Add accepted attendees
        for (const jr of event.event_join_request) {
          if (jr.user && !recipients.some((r) => r.id === jr.user.id)) {
            recipients.push(jr.user);
          }
        }

        for (const recipient of recipients) {
          metrics.processed++;

          // Dedupe key includes event, user, and offset - unique per reminder instance
          const dedupeKey = `reminder:${event.id}:${recipient.id}:${offsetMinutes}`;

          // Atomic upsert pattern: try to create, catch if exists (idempotent)
          try {
            // First check if already sent
            const existingLog = await db.notification_delivery_log.findUnique({
              where: { userId_dedupeKey: { userId: recipient.id, dedupeKey } },
            });

            if (existingLog) {
              metrics.skipped.dedupe++;
              continue;
            }

            // Get user preferences
            let prefs = await db.notification_preferences.findUnique({
              where: { userId: recipient.id },
            });

            if (!prefs) {
              prefs = await db.notification_preferences.create({
                data: { userId: recipient.id },
              });
            }

            // Check if user has this offset in their preferences
            const userOffsets = parseReminderOffsets(prefs.reminderOffsets);
            if (!userOffsets.includes(offsetMinutes)) {
              metrics.skipped.prefs++;
              continue;
            }

            // Check if eventReminders is enabled
            if (!prefs.eventReminders) {
              metrics.skipped.prefs++;
              continue;
            }

            // Build notification content
            const offsetLabel = getOffsetLabel(offsetMinutes);
            const title = `Reminder: ${event.title}`;
            const body = `${offsetLabel} — Tap to view`;

            // Create in-app notification and dedupe log atomically (via transaction)
            await db.$transaction([
              db.notification.create({
                data: {
                  userId: recipient.id,
                  type: "EVENT_REMINDER",
                  title,
                  body,
                  data: JSON.stringify({
                    eventId: event.id,
                    eventTitle: event.title,
                    eventEmoji: event.emoji,
                    offsetMinutes,
                    deepLink: `/event/${event.id}`,
                  }),
                },
              }),
              db.notification_delivery_log.create({
                data: { userId: recipient.id, dedupeKey },
              }),
            ]);
            metrics.sent.inApp++;

            // Determine if we should send push
            const canSendPush =
              prefs.pushEnabled &&
              recipient.pushPermissionStatus === "granted" &&
              !isInQuietHours(prefs, prefs.timezone);

            if (!canSendPush) {
              if (isInQuietHours(prefs, prefs.timezone)) {
                metrics.skipped.quietHours++;
              }
              continue;
            }

            // Get active tokens
            const tokens = await db.push_token.findMany({
              where: { userId: recipient.id, isActive: true },
            });

            if (tokens.length === 0) {
              metrics.skipped.noToken++;
              continue;
            }

            // Send push
            const messages: ExpoPushMessage[] = tokens.map((token) => ({
              to: token.token,
              title,
              body,
              data: {
                type: "EVENT_REMINDER",
                eventId: event.id,
                screen: "event",
                deepLink: `/event/${event.id}`,
              },
              sound: "default",
              channelId: "reminders",
            }));

            await sendExpoPush(messages);
            metrics.sent.push++;
          } catch (dedupeError: any) {
            // Handle unique constraint violation (concurrent insert)
            if (dedupeError?.code === "P2002") {
              metrics.skipped.dedupe++;
              continue;
            }
            throw dedupeError;
          }
        }
      }
    }

    console.log(
      `[Cron] ${JOB_NAME}: END | processed=${metrics.processed} inApp=${metrics.sent.inApp} push=${metrics.sent.push} skipped=${JSON.stringify(metrics.skipped)}`
    );

    return c.json(buildResponse(JOB_NAME, startTime, { metrics }));
  } catch (error) {
    success = false;
    console.error(`[Cron] ${JOB_NAME}: ERROR`, error);
    return c.json(buildErrorResponse(JOB_NAME, startTime, "REMINDERS_RUN_FAILED"), 500);
  } finally {
    if (lease.ownerId) {
      await releaseJobLease(JOB_NAME, lease.ownerId);
    }
  }
});

// ============================================
// Digest Runner
// ============================================

/**
 * POST /api/cron/digest/run
 *
 * Send daily digest to users who have it enabled.
 * Runs every 15 minutes via Render Cron.
 *
 * Idempotency:
 * - Job-level lease prevents overlapping executions
 * - Per-user dedupe via notification_delivery_log with user-timezone-based date key
 * - Dedupe key uses user's local date (from their timezone preference)
 *
 * Logic:
 * 1. Acquire job lease
 * 2. Find users with dailyDigest enabled
 * 3. Check if current time matches their digest time (+/- 15 min window)
 * 4. Check if today is in their digestDaysOfWeek
 * 5. Build summary of upcoming events
 * 6. Send notification (dedupe by user's local date)
 * 7. Release job lease
 */
cronRouter.post("/digest/run", async (c) => {
  const JOB_NAME = "digest";
  const startTime = Date.now();

  console.log(`[Cron] ${JOB_NAME}: START`);

  // Acquire lease to prevent overlapping executions
  const lease = await acquireJobLease(JOB_NAME, LEASE_TTL_MS.digest);
  if (!lease.acquired) {
    console.log(`[Cron] ${JOB_NAME}: SKIPPED (${lease.reason})`);
    return c.json(
      buildResponse(JOB_NAME, startTime, {
        skipped: true,
        reason: lease.reason,
        metrics: {},
      })
    );
  }

  const metrics = {
    eligibleUsers: 0,
    sent: {
      inApp: 0,
      push: 0,
    },
    skipped: {
      window: 0,
      day: 0,
      dedupe: 0,
      quietHours: 0,
      noToken: 0,
    },
  };

  let success = true;

  try {
    // Find users with dailyDigest enabled
    const usersWithDigest = await db.notification_preferences.findMany({
      where: { dailyDigest: true },
    });

    metrics.eligibleUsers = usersWithDigest.length;

    for (const prefs of usersWithDigest) {
      const userId = prefs.userId;

      // Get user's local time (using their timezone preference)
      const { localMinutes, localDayOfWeek, localDateString } = getUserLocalTime(
        prefs.timezone
      );

      // Check if today is in their digest days
      const digestDays = parseDigestDays(prefs.digestDaysOfWeek);
      if (!digestDays.includes(localDayOfWeek)) {
        metrics.skipped.day++;
        continue;
      }

      // Check if current time is within +/- 15 minutes of digest time
      const digestTimeMinutes = parseDigestTimeMinutes(prefs.dailyDigestTime);
      const timeDiff = Math.abs(localMinutes - digestTimeMinutes);
      // Handle midnight crossing
      const adjustedDiff = Math.min(timeDiff, 1440 - timeDiff);
      if (adjustedDiff > 15) {
        metrics.skipped.window++;
        continue;
      }

      // Dedupe key based on user and date - one digest per day per user
      const dedupeKey = `digest:${userId}:${localDateString}`;

      try {
        // Check dedupe
        const existingLog = await db.notification_delivery_log.findUnique({
          where: { userId_dedupeKey: { userId, dedupeKey } },
        });

        if (existingLog) {
          metrics.skipped.dedupe++;
          continue;
        }

        // Get user for push permission status
        const user = await db.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true, pushPermissionStatus: true },
        });

        if (!user) continue;

        // Build digest content
        const sevenDaysFromNow = new Date();
        sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

        // Count upcoming events user is hosting or attending
        const [hostedEvents, attendingEvents] = await Promise.all([
          db.event.count({
            where: {
              userId,
              startTime: { gte: new Date(), lte: sevenDaysFromNow },
            },
          }),
          db.event_join_request.count({
            where: {
              userId,
              status: "accepted",
              event: {
                startTime: { gte: new Date(), lte: sevenDaysFromNow },
              },
            },
          }),
        ]);

        const totalEvents = hostedEvents + attendingEvents;

        // Get next upcoming event
        const nextEvent = await db.event.findFirst({
          where: {
            OR: [
              { userId },
              { event_join_request: { some: { userId, status: "accepted" } } },
            ],
            startTime: { gte: new Date() },
          },
          orderBy: { startTime: "asc" },
          select: { title: true, startTime: true, emoji: true },
        });

        // Build body (max 160 chars)
        let body = "";
        if (totalEvents === 0) {
          body = "No upcoming plans this week. Time to create some!";
        } else {
          body = `You have ${totalEvents} plan${totalEvents > 1 ? "s" : ""} this week.`;
          if (nextEvent) {
            const eventDate = nextEvent.startTime.toLocaleDateString("en-US", {
              weekday: "short",
              hour: "numeric",
              minute: "2-digit",
            });
            const nextPart = ` Next: ${nextEvent.emoji} ${nextEvent.title} ${eventDate}`;
            if (body.length + nextPart.length <= 160) {
              body += nextPart;
            }
          }
        }

        const title = "Your Open Invite Digest";

        // Create in-app notification and dedupe log atomically
        await db.$transaction([
          db.notification.create({
            data: {
              userId,
              type: "DAILY_DIGEST",
              title,
              body,
              data: JSON.stringify({
                totalEvents,
                nextEventTitle: nextEvent?.title,
                deepLink: "/",
              }),
            },
          }),
          db.notification_delivery_log.create({
            data: { userId, dedupeKey },
          }),
        ]);
        metrics.sent.inApp++;

        // Determine if we should send push
        const canSendPush =
          prefs.pushEnabled &&
          user.pushPermissionStatus === "granted" &&
          !isInQuietHours(prefs, prefs.timezone);

        if (!canSendPush) {
          if (isInQuietHours(prefs, prefs.timezone)) {
            metrics.skipped.quietHours++;
          }
          continue;
        }

        // Get active tokens
        const tokens = await db.push_token.findMany({
          where: { userId, isActive: true },
        });

        if (tokens.length === 0) {
          metrics.skipped.noToken++;
          continue;
        }

        // Send push
        const messages: ExpoPushMessage[] = tokens.map((token) => ({
          to: token.token,
          title,
          body,
          data: {
            type: "DAILY_DIGEST",
            screen: "home",
            deepLink: "/",
          },
          sound: "default",
          channelId: "default",
        }));

        await sendExpoPush(messages);
        metrics.sent.push++;
      } catch (dedupeError: any) {
        // Handle unique constraint violation (concurrent insert)
        if (dedupeError?.code === "P2002") {
          metrics.skipped.dedupe++;
          continue;
        }
        throw dedupeError;
      }
    }

    console.log(
      `[Cron] ${JOB_NAME}: END | eligible=${metrics.eligibleUsers} inApp=${metrics.sent.inApp} push=${metrics.sent.push} skipped=${JSON.stringify(metrics.skipped)}`
    );

    return c.json(buildResponse(JOB_NAME, startTime, { metrics }));
  } catch (error) {
    success = false;
    console.error(`[Cron] ${JOB_NAME}: ERROR`, error);
    return c.json(buildErrorResponse(JOB_NAME, startTime, "DIGEST_RUN_FAILED"), 500);
  } finally {
    if (lease.ownerId) {
      await releaseJobLease(JOB_NAME, lease.ownerId);
    }
  }
});

// ============================================
// Token Cleanup
// ============================================

/**
 * POST /api/cron/cleanup/tokens
 * POST /api/cron/tokens/cleanup (alias)
 *
 * Mark tokens as inactive if lastSeenAt > 90 days
 * Hard-delete tokens inactive for > 180 days
 *
 * Schedule: Weekly, Monday 08:00 UTC
 *
 * Note: Token cleanup is idempotent by nature (updateMany/deleteMany are safe)
 * No job-level lock needed as operations are atomic at DB level
 */
async function handleTokenCleanup(c: any) {
  const JOB_NAME = "token_cleanup";
  const startTime = Date.now();

  console.log(`[Cron] ${JOB_NAME}: START`);

  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const oneEightyDaysAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

  try {
    // 1. Hard-delete tokens inactive for > 180 days
    const deletedResult = await db.push_token.deleteMany({
      where: {
        isActive: false,
        lastSeenAt: {
          lt: oneEightyDaysAgo,
        },
      },
    });

    // 2. Mark as inactive: tokens not seen in 90 days
    const deactivatedResult = await db.push_token.updateMany({
      where: {
        isActive: true,
        lastSeenAt: {
          lt: ninetyDaysAgo,
        },
      },
      data: {
        isActive: false,
      },
    });

    const metrics = {
      deactivated: deactivatedResult.count,
      deleted: deletedResult.count,
      thresholds: {
        deactivateAfterDays: 90,
        deleteAfterDays: 180,
      },
    };

    console.log(
      `[Cron] ${JOB_NAME}: END | deactivated=${metrics.deactivated} deleted=${metrics.deleted}`
    );

    return c.json(buildResponse(JOB_NAME, startTime, { metrics }));
  } catch (error) {
    console.error(`[Cron] ${JOB_NAME}: ERROR`, error);
    return c.json(buildErrorResponse(JOB_NAME, startTime, "TOKEN_CLEANUP_FAILED"), 500);
  }
}

cronRouter.post("/cleanup/tokens", handleTokenCleanup);
cronRouter.post("/tokens/cleanup", handleTokenCleanup);

// ============================================
// Dedupe Log Cleanup
// ============================================

/**
 * POST /api/cron/cleanup/dedupe
 * POST /api/cron/notifications/dedupe/cleanup (alias)
 *
 * Delete notification_delivery_log entries older than 60 days
 *
 * Schedule: Weekly, Monday 08:30 UTC (not in active Render cron config)
 */
async function handleDedupeCleanup(c: any) {
  const JOB_NAME = "dedupe_cleanup";
  const startTime = Date.now();

  console.log(`[Cron] ${JOB_NAME}: START`);

  const now = new Date();
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  try {
    const deletedResult = await db.notification_delivery_log.deleteMany({
      where: {
        sentAt: {
          lt: sixtyDaysAgo,
        },
      },
    });

    const metrics = {
      deleted: deletedResult.count,
      thresholds: {
        deleteAfterDays: 60,
      },
    };

    console.log(`[Cron] ${JOB_NAME}: END | deleted=${metrics.deleted}`);

    return c.json(buildResponse(JOB_NAME, startTime, { metrics }));
  } catch (error) {
    console.error(`[Cron] ${JOB_NAME}: ERROR`, error);
    return c.json(buildErrorResponse(JOB_NAME, startTime, "DEDUPE_CLEANUP_FAILED"), 500);
  }
}

cronRouter.post("/cleanup/dedupe", handleDedupeCleanup);
cronRouter.post("/notifications/dedupe/cleanup", handleDedupeCleanup);

// ============================================
// Session Cleanup
// ============================================

/**
 * POST /api/cron/cleanup/sessions
 *
 * Delete expired sessions older than 7 days past expiration
 *
 * Schedule: Weekly, Monday 09:00 UTC (not in active Render cron config)
 */
cronRouter.post("/cleanup/sessions", async (c) => {
  const JOB_NAME = "session_cleanup";
  const startTime = Date.now();

  console.log(`[Cron] ${JOB_NAME}: START`);

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  try {
    const deletedResult = await db.session.deleteMany({
      where: {
        expiresAt: {
          lt: sevenDaysAgo,
        },
      },
    });

    const metrics = {
      deleted: deletedResult.count,
      thresholds: {
        deleteAfterExpiryDays: 7,
      },
    };

    console.log(`[Cron] ${JOB_NAME}: END | deleted=${metrics.deleted}`);

    return c.json(buildResponse(JOB_NAME, startTime, { metrics }));
  } catch (error) {
    console.error(`[Cron] ${JOB_NAME}: ERROR`, error);
    return c.json(buildErrorResponse(JOB_NAME, startTime, "SESSION_CLEANUP_FAILED"), 500);
  }
});

// ============================================
// Health Check
// ============================================

/**
 * GET /api/cron/health
 *
 * Health check for cron system
 * Validates that CRON_SECRET is configured and working
 */
cronRouter.get("/health", async (c) => {
  const JOB_NAME = "health";
  const startTime = Date.now();

  console.log(`[Cron] ${JOB_NAME}: CHECK`);

  // Test database connectivity
  let dbStatus = "ok";
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = "error";
  }

  return c.json(
    buildResponse(JOB_NAME, startTime, {
      message: "Cron system healthy",
      db: dbStatus,
      env: process.env.NODE_ENV || "development",
    })
  );
});
