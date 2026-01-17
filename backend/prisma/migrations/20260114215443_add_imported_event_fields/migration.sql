-- AlterTable
ALTER TABLE "event" ADD COLUMN     "deviceCalendarId" TEXT,
ADD COLUMN     "deviceCalendarName" TEXT,
ADD COLUMN     "importedAt" TIMESTAMP(3),
ADD COLUMN     "isImported" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "event_userId_deviceCalendarId_idx" ON "event"("userId", "deviceCalendarId");
