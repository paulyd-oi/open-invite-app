-- AlterTable
ALTER TABLE "event" ADD COLUMN     "summary" TEXT,
ADD COLUMN     "summaryNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "summaryRating" INTEGER;
