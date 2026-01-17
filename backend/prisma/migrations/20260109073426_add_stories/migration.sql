-- CreateTable
CREATE TABLE "story" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "content" TEXT,
    "imageUrl" TEXT,
    "eventId" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'all_friends',
    "backgroundColor" TEXT NOT NULL DEFAULT '#FF6B4A',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_view" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_view_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_group_visibility" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_group_visibility_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "story_view_storyId_userId_key" ON "story_view"("storyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "story_group_visibility_storyId_groupId_key" ON "story_group_visibility"("storyId", "groupId");

-- AddForeignKey
ALTER TABLE "story" ADD CONSTRAINT "story_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_view" ADD CONSTRAINT "story_view_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_group_visibility" ADD CONSTRAINT "story_group_visibility_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_group_visibility" ADD CONSTRAINT "story_group_visibility_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "friend_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
