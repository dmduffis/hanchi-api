-- CreateEnum
CREATE TYPE "CollectionVisibility" AS ENUM ('private', 'public');

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "visibility" "CollectionVisibility" NOT NULL DEFAULT 'private',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "shareSlug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionItem" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "type" "FavoriteType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionFollow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionFollow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Collection_shareSlug_key" ON "Collection"("shareSlug");

-- CreateIndex
CREATE INDEX "Collection_userId_idx" ON "Collection"("userId");

-- CreateIndex
CREATE INDEX "Collection_visibility_idx" ON "Collection"("visibility");

-- CreateIndex
CREATE INDEX "CollectionItem_collectionId_idx" ON "CollectionItem"("collectionId");

-- CreateIndex
CREATE INDEX "CollectionItem_type_targetId_idx" ON "CollectionItem"("type", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionItem_collectionId_type_targetId_key" ON "CollectionItem"("collectionId", "type", "targetId");

-- CreateIndex
CREATE INDEX "CollectionFollow_userId_idx" ON "CollectionFollow"("userId");

-- CreateIndex
CREATE INDEX "CollectionFollow_collectionId_idx" ON "CollectionFollow"("collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionFollow_userId_collectionId_key" ON "CollectionFollow"("userId", "collectionId");

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionFollow" ADD CONSTRAINT "CollectionFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionFollow" ADD CONSTRAINT "CollectionFollow_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: default "Saved" collection per user that has favorites, copy items
INSERT INTO "Collection" ("id", "userId", "name", "description", "visibility", "isDefault", "shareSlug", "createdAt", "updatedAt")
SELECT
  'col_saved_' || u."id",
  u."id",
  'Saved',
  NULL,
  'private',
  true,
  md5(random()::text || u."id" || clock_timestamp()::text),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" u
WHERE EXISTS (SELECT 1 FROM "Favorite" f WHERE f."userId" = u."id")
  AND NOT EXISTS (
    SELECT 1 FROM "Collection" c WHERE c."userId" = u."id" AND c."isDefault" = true
  );

INSERT INTO "CollectionItem" ("id", "collectionId", "type", "targetId", "note", "createdAt")
SELECT
  'ci_' || f."id",
  'col_saved_' || f."userId",
  f."type",
  f."targetId",
  NULL,
  f."createdAt"
FROM "Favorite" f
WHERE EXISTS (
  SELECT 1 FROM "Collection" c
  WHERE c."id" = 'col_saved_' || f."userId"
)
ON CONFLICT DO NOTHING;
