-- Migration: make_event_endtime_required
-- Purpose: Make endTime required on event table and backfill existing NULL values

-- Step 1: Backfill NULL endTime values with startTime + 1 hour (safe single UPDATE)
UPDATE "event"
SET "endTime" = "startTime" + INTERVAL '1 hour'
WHERE "endTime" IS NULL;

-- Step 2: Make endTime NOT NULL (now that all rows have values)
ALTER TABLE "event" ALTER COLUMN "endTime" SET NOT NULL;
