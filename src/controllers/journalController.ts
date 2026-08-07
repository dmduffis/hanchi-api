import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import type { AuthenticatedRequest } from "../middleware/auth";
import type { CreateJournalBody } from "../types";
import { resolveApprovedMedia } from "./mediaController";

const MAX_MOMENT_PHOTOS = 6;

const journalInclude = {
  community: { select: { id: true, name: true } },
  poi: {
    select: {
      id: true,
      name: true,
      communityId: true,
      category: true,
      ethnicities: true,
    },
  },
} as const;

type JournalWithPlace = {
  id: string;
  userId: string;
  communityId: string | null;
  poiId: string | null;
  note: string;
  photoUrl: string | null;
  photoUrls: string[];
  createdAt: Date;
  community: { id: string; name: string } | null;
  poi: {
    id: string;
    name: string;
    communityId: string | null;
    category: string;
    ethnicities: string[];
  } | null;
};

function mapJournalEntry(entry: JournalWithPlace) {
  const photoUrls =
    entry.photoUrls?.length > 0
      ? entry.photoUrls
      : entry.photoUrl
        ? [entry.photoUrl]
        : [];
  return {
    id: entry.id,
    userId: entry.userId,
    communityId: entry.communityId,
    poiId: entry.poiId,
    note: entry.note,
    photoUrl: photoUrls[0] ?? null,
    photoUrls,
    createdAt: entry.createdAt.toISOString(),
    communityName: entry.community?.name ?? null,
    poiName: entry.poi?.name ?? null,
    poi: entry.poi
      ? {
          id: entry.poi.id,
          name: entry.poi.name,
          communityId: entry.poi.communityId,
          category: entry.poi.category,
          ethnicities: entry.poi.ethnicities ?? [],
        }
      : null,
  };
}

export async function createJournalHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as CreateJournalBody;
    const note = body.note?.trim();
    if (!note) {
      res.status(400).json({ error: "note is required" });
      return;
    }

    const userId = (req as AuthenticatedRequest).userId;
    let communityId = body.communityId ?? null;
    const poiId = body.poiId ?? null;

    const mediaIds: string[] = [];
    if (Array.isArray(body.mediaIds)) {
      for (const id of body.mediaIds) {
        if (typeof id === "string" && id.trim()) mediaIds.push(id.trim());
      }
    } else if (typeof body.mediaId === "string" && body.mediaId.trim()) {
      mediaIds.push(body.mediaId.trim());
    }

    if (mediaIds.length > MAX_MOMENT_PHOTOS) {
      res.status(400).json({
        error: `You can attach up to ${MAX_MOMENT_PHOTOS} photos`,
        code: "too_many_photos",
      });
      return;
    }

    const photoUrls: string[] = [];
    for (const mediaId of mediaIds) {
      const media = await resolveApprovedMedia(userId, mediaId, "moment");
      if (!media) {
        res.status(400).json({
          error: "Photo is missing or not approved. Upload again.",
          code: "invalid_media",
        });
        return;
      }
      photoUrls.push(media.publicUrl);
    }

    if (poiId) {
      const poi = await prisma.poi.findUnique({ where: { id: poiId } });
      if (!poi) {
        res.status(404).json({ error: "POI not found" });
        return;
      }
      // Restaurant check-in implies its community when present.
      if (!communityId && poi.communityId) {
        communityId = poi.communityId;
      }
    }

    if (communityId) {
      const community = await prisma.community.findUnique({
        where: { id: communityId },
      });
      if (!community) {
        res.status(404).json({ error: "Community not found" });
        return;
      }
    }

    const entry = await prisma.journalEntry.create({
      data: {
        userId,
        note,
        communityId,
        poiId,
        photoUrl: photoUrls[0] ?? null,
        photoUrls,
      },
      include: journalInclude,
    });

    res.status(201).json(mapJournalEntry(entry));
  } catch (err) {
    next(err);
  }
}

export async function listUserJournalHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const authedId = (req as AuthenticatedRequest).userId;
    if (id !== authedId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const entries = await prisma.journalEntry.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      include: journalInclude,
    });

    res.json(entries.map(mapJournalEntry));
  } catch (err) {
    next(err);
  }
}

/** DELETE /journal/:id — owner only. */
export async function deleteJournalHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id?.trim()) {
      res.status(400).json({ error: "id is required" });
      return;
    }

    const userId = (req as AuthenticatedRequest).userId;
    const existing = await prisma.journalEntry.findUnique({
      where: { id },
      select: { id: true, userId: true, photoUrls: true, photoUrl: true },
    });

    if (!existing) {
      res.status(404).json({ error: "Moment not found" });
      return;
    }
    if (existing.userId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    await prisma.journalEntry.delete({ where: { id } });
    res.json({ ok: true, id });
  } catch (err) {
    next(err);
  }
}

/** PATCH /journal/:id — owner only; note / place. Photos unchanged. */
export async function updateJournalHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id?.trim()) {
      res.status(400).json({ error: "id is required" });
      return;
    }

    const userId = (req as AuthenticatedRequest).userId;
    const existing = await prisma.journalEntry.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Moment not found" });
      return;
    }
    if (existing.userId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const body = req.body as {
      note?: string;
      communityId?: string | null;
      poiId?: string | null;
    };

    const data: {
      note?: string;
      communityId?: string | null;
      poiId?: string | null;
    } = {};

    if (typeof body.note === "string") {
      const note = body.note.trim();
      if (!note) {
        res.status(400).json({ error: "note is required" });
        return;
      }
      data.note = note;
    }

    if ("communityId" in body) {
      const communityId = body.communityId ?? null;
      if (communityId) {
        const community = await prisma.community.findUnique({
          where: { id: communityId },
        });
        if (!community) {
          res.status(404).json({ error: "Community not found" });
          return;
        }
      }
      data.communityId = communityId;
    }

    if ("poiId" in body) {
      const poiId = body.poiId ?? null;
      if (poiId) {
        const poi = await prisma.poi.findUnique({ where: { id: poiId } });
        if (!poi) {
          res.status(404).json({ error: "POI not found" });
          return;
        }
        if (!("communityId" in body) && poi.communityId && !data.communityId) {
          data.communityId = poi.communityId;
        }
      }
      data.poiId = poiId;
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const entry = await prisma.journalEntry.update({
      where: { id },
      data,
      include: journalInclude,
    });

    res.json(mapJournalEntry(entry));
  } catch (err) {
    next(err);
  }
}
