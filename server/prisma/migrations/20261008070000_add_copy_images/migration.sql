-- CreateTable
CREATE TABLE "copy_images" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "side" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteLength" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ownerId" TEXT NOT NULL,
    "copyId" TEXT NOT NULL,
    CONSTRAINT "copy_images_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "copy_images_copyId_fkey" FOREIGN KEY ("copyId") REFERENCES "user_copies" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "copy_images_copyId_side_key" ON "copy_images"("copyId", "side");

-- CreateIndex
CREATE INDEX "copy_images_ownerId_idx" ON "copy_images"("ownerId");
