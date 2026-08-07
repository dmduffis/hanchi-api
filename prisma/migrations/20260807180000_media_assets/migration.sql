-- CreateEnum
CREATE TYPE "MediaPurpose" AS ENUM ('moment', 'avatar');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "MediaPurpose" NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'pending',
    "storageKey" TEXT,
    "publicUrl" TEXT,
    "mimeType" TEXT,
    "byteSize" INTEGER,
    "moderationJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MediaAsset_userId_status_idx" ON "MediaAsset"("userId", "status");

-- CreateIndex
CREATE INDEX "MediaAsset_userId_purpose_idx" ON "MediaAsset"("userId", "purpose");

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
