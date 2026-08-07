import type { Request, Response, NextFunction } from "express";
import type { MediaPurpose } from "@prisma/client";
import { prisma } from "../lib/prisma";
import type { AuthenticatedRequest } from "../middleware/auth";
import {
  decodeDataUrlOrBase64,
  extForMime,
  sniffImageMime,
} from "../lib/imageBytes";
import {
  deleteStoredObject,
  maxMediaBytes,
  mediaUploadsEnabled,
  publicStorageKey,
  putPublicImage,
} from "../lib/mediaStorage";
import { moderateImageBytes } from "../lib/safeSearch";
import { assertUploadRateLimit } from "../lib/uploadRateLimit";

function parsePurpose(value: unknown): MediaPurpose | null {
  if (value === "moment" || value === "avatar") return value;
  return null;
}

/**
 * POST /media
 * Body: { purpose: "moment"|"avatar", imageBase64: string }
 *
 * Validates, rate-limits, runs SafeSearch, only then stores to Supabase Storage.
 * Hard-block: unsafe images never get a public URL.
 */
export async function uploadMediaHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (process.env.MEDIA_UPLOADS_ENABLED === "0") {
      res.status(503).json({
        error: "Photo uploads are temporarily disabled",
        code: "uploads_disabled",
      });
      return;
    }
    if (!mediaUploadsEnabled()) {
      res.status(503).json({
        error: "Photo storage is not configured",
        code: "storage_unavailable",
      });
      return;
    }

    const userId = (req as AuthenticatedRequest).userId;
    const purpose = parsePurpose(req.body?.purpose);
    if (!purpose) {
      res.status(400).json({
        error: "purpose must be moment or avatar",
        code: "invalid_purpose",
      });
      return;
    }

    const rate = assertUploadRateLimit(userId);
    if (!rate.ok) {
      res.status(429).json({
        error: "Too many photo uploads. Try again later.",
        code: "rate_limited",
        retryAfterSec: rate.retryAfterSec,
      });
      return;
    }

    const raw =
      typeof req.body?.imageBase64 === "string" ? req.body.imageBase64 : "";
    const bytes = decodeDataUrlOrBase64(raw);
    if (!bytes) {
      res.status(400).json({
        error: "imageBase64 is required",
        code: "invalid_image",
      });
      return;
    }

    const max = maxMediaBytes();
    if (bytes.length > max) {
      res.status(400).json({
        error: `Photo must be under ${Math.floor(max / (1024 * 1024))}MB`,
        code: "too_large",
      });
      return;
    }

    const mime = sniffImageMime(bytes);
    if (!mime) {
      res.status(400).json({
        error: "Only JPEG, PNG, or WebP photos are allowed",
        code: "invalid_image",
      });
      return;
    }

    const asset = await prisma.mediaAsset.create({
      data: {
        userId,
        purpose,
        status: "pending",
        mimeType: mime,
        byteSize: bytes.length,
      },
    });

    const mod = await moderateImageBytes(bytes);
    if (!mod.ok) {
      await prisma.mediaAsset.update({
        where: { id: asset.id },
        data: {
          status: "rejected",
          moderationJson: {
            reason: mod.reason ?? "content_rejected",
            labels: mod.labels,
          },
        },
      });
      const status = mod.reason === "moderation_unavailable" ? 503 : 422;
      res.status(status).json({
        error:
          mod.reason === "moderation_unavailable"
            ? "Could not check this photo right now. Try again later."
            : "This photo can’t be uploaded.",
        code: mod.reason ?? "content_rejected",
        mediaId: asset.id,
      });
      return;
    }

    const storageKey = publicStorageKey(
      purpose,
      userId,
      asset.id,
      extForMime(mime),
    );

    let publicUrl: string;
    try {
      const stored = await putPublicImage({
        storageKey,
        bytes,
        contentType: mime,
      });
      publicUrl = stored.publicUrl;
    } catch (err) {
      const message = err instanceof Error ? err.message : "storage_failed";
      console.error("[media] store failed:", message);
      await prisma.mediaAsset.update({
        where: { id: asset.id },
        data: {
          status: "rejected",
          moderationJson: {
            reason: "storage_failed",
            message,
          },
        },
      });
      res.status(503).json({
        error: "Could not store photo. Try again later.",
        code: "storage_unavailable",
        mediaId: asset.id,
        ...(process.env.NODE_ENV !== "production" ? { detail: message } : {}),
      });
      return;
    }

    const approved = await prisma.mediaAsset.update({
      where: { id: asset.id },
      data: {
        status: "approved",
        storageKey,
        publicUrl,
        moderationJson: {
          reason: "approved",
          labels: mod.labels,
        },
      },
    });

    res.status(201).json({
      mediaId: approved.id,
      purpose: approved.purpose,
      status: approved.status,
      publicUrl: approved.publicUrl,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Resolve an approved media asset owned by the user for journal/avatar attach.
 */
export async function resolveApprovedMedia(
  userId: string,
  mediaId: string,
  purpose?: MediaPurpose,
): Promise<{ id: string; publicUrl: string } | null> {
  const asset = await prisma.mediaAsset.findFirst({
    where: {
      id: mediaId,
      userId,
      status: "approved",
      ...(purpose ? { purpose } : {}),
    },
  });
  if (!asset?.publicUrl) return null;
  return { id: asset.id, publicUrl: asset.publicUrl };
}

/** Best-effort delete for replaced avatars. */
export async function deleteMediaPublicUrl(url: string | null | undefined) {
  if (!url) return;
  await deleteStoredObject(url);
}
