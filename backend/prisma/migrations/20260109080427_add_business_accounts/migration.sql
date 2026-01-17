-- CreateTable
CREATE TABLE "business" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'other',
    "logoUrl" TEXT,
    "coverUrl" TEXT,
    "website" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "location" TEXT,
    "instagram" TEXT,
    "twitter" TEXT,
    "facebook" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_event" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "emoji" TEXT NOT NULL DEFAULT '📅',
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrence" TEXT,
    "category" TEXT,
    "maxAttendees" INTEGER,
    "rsvpDeadline" TIMESTAMP(3),
    "coverUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_event_attendee" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'attending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_event_attendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_event_interest" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_event_interest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_event_comment" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_event_comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_follow" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notifyEvents" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_follow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_handle_key" ON "business"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "business_event_attendee_eventId_userId_key" ON "business_event_attendee"("eventId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "business_event_interest_eventId_userId_key" ON "business_event_interest"("eventId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "business_follow_businessId_userId_key" ON "business_follow"("businessId", "userId");

-- AddForeignKey
ALTER TABLE "business_event" ADD CONSTRAINT "business_event_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_event_attendee" ADD CONSTRAINT "business_event_attendee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "business_event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_event_interest" ADD CONSTRAINT "business_event_interest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "business_event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_event_comment" ADD CONSTRAINT "business_event_comment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "business_event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_follow" ADD CONSTRAINT "business_follow_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
