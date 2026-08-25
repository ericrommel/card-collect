-- CreateTable
CREATE TABLE "collection_shares" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shareId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "showCompletion" BOOLEAN NOT NULL DEFAULT true,
    "showOwned" BOOLEAN NOT NULL DEFAULT true,
    "showMissing" BOOLEAN NOT NULL DEFAULT true,
    "showDuplicates" BOOLEAN NOT NULL DEFAULT true,
    "showTrade" BOOLEAN NOT NULL DEFAULT true,
    "showGiveAway" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ownerId" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    CONSTRAINT "collection_shares_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "collection_shares_setId_fkey" FOREIGN KEY ("setId") REFERENCES "sets" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "collection_shares_shareId_key" ON "collection_shares"("shareId");

-- CreateIndex
CREATE UNIQUE INDEX "collection_shares_ownerId_setId_key" ON "collection_shares"("ownerId", "setId");
