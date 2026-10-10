-- CreateTable
CREATE TABLE "personal_cards" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "rawName" TEXT NOT NULL,
    "rawGame" TEXT NOT NULL,
    "rawSetName" TEXT NOT NULL,
    "rawNumber" TEXT,
    "noNumber" BOOLEAN NOT NULL,
    "name" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "setName" TEXT NOT NULL,
    "number" TEXT,
    "rawSetCode" TEXT,
    "setCode" TEXT,
    "rawRarity" TEXT,
    "rarity" TEXT,
    "rawLanguage" TEXT,
    "language" TEXT,
    "normalizedKey" TEXT NOT NULL,
    "disambiguator" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "personal_cards_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "personal_copies" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "availability" TEXT NOT NULL DEFAULT 'KEEP',
    "condition" TEXT,
    "rawPrinting" TEXT,
    "printing" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ownerId" TEXT NOT NULL,
    "personalCardId" TEXT NOT NULL,
    CONSTRAINT "personal_copies_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "personal_copies_personalCardId_fkey" FOREIGN KEY ("personalCardId") REFERENCES "personal_cards" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "personal_cards_ownerId_normalizedKey_disambiguator_key" ON "personal_cards"("ownerId", "normalizedKey", "disambiguator");

-- CreateIndex
CREATE INDEX "personal_cards_ownerId_idx" ON "personal_cards"("ownerId");

-- CreateIndex
CREATE INDEX "personal_copies_ownerId_idx" ON "personal_copies"("ownerId");

-- CreateIndex
CREATE INDEX "personal_copies_personalCardId_idx" ON "personal_copies"("personalCardId");
