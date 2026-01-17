-- AlterTable
ALTER TABLE "user" ADD COLUMN     "allowFriendRequests" TEXT NOT NULL DEFAULT 'everyone',
ADD COLUMN     "shareCalendarAvailability" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showInFriendSuggestions" BOOLEAN NOT NULL DEFAULT true;
