-- AlterTable
ALTER TABLE "collection_shares" ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "collection_shares" ADD COLUMN "lastViewedAt" DATETIME;
