-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "collectible_universes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "sets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "releaseDate" DATETIME,
    "universeId" TEXT NOT NULL,
    CONSTRAINT "sets_universeId_fkey" FOREIGN KEY ("universeId") REFERENCES "collectible_universes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "collectibles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerId" TEXT,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rarity" TEXT,
    "metadata" TEXT,
    "setId" TEXT NOT NULL,
    CONSTRAINT "collectibles_setId_fkey" FOREIGN KEY ("setId") REFERENCES "sets" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "variants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "collectibleId" TEXT NOT NULL,
    CONSTRAINT "variants_collectibleId_fkey" FOREIGN KEY ("collectibleId") REFERENCES "collectibles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "user_copies" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "availability" TEXT NOT NULL DEFAULT 'KEEP',
    "condition" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ownerId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    CONSTRAINT "user_copies_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "user_copies_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "variants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "collectible_universes_slug_key" ON "collectible_universes"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "sets_code_key" ON "sets"("code");

-- CreateIndex
CREATE UNIQUE INDEX "collectibles_setId_number_key" ON "collectibles"("setId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "variants_collectibleId_name_key" ON "variants"("collectibleId", "name");
