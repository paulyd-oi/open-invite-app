-- CreateTable
CREATE TABLE "circle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '👥',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "circle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "circle_member" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "circle_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "circle_message" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "circle_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "circle_event" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "circle_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pinned_friendship" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "friendshipId" TEXT NOT NULL,
    "pinnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pinned_friendship_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "circle_member_circleId_userId_key" ON "circle_member"("circleId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "circle_event_eventId_key" ON "circle_event"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "pinned_friendship_userId_friendshipId_key" ON "pinned_friendship"("userId", "friendshipId");

-- AddForeignKey
ALTER TABLE "circle_member" ADD CONSTRAINT "circle_member_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circle_message" ADD CONSTRAINT "circle_message_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circle_event" ADD CONSTRAINT "circle_event_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
