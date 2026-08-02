import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import type { AuthenticatedRequest } from "../middleware/auth";
import type { CreateStampBody, DeleteStampBody } from "../types";

export async function createStampHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as CreateStampBody;
    const communityId = body.communityId?.trim();
    if (!communityId) {
      res.status(400).json({ error: "communityId is required" });
      return;
    }

    const userId = (req as AuthenticatedRequest).userId;

    const community = await prisma.community.findUnique({
      where: { id: communityId },
    });
    if (!community) {
      res.status(404).json({ error: "Community not found" });
      return;
    }

    const stamp = await prisma.stamp.upsert({
      where: {
        userId_communityId: { userId, communityId },
      },
      create: { userId, communityId },
      update: {},
      include: {
        community: {
          select: {
            id: true,
            name: true,
            neighborhood: true,
            city: true,
            description: true,
            heroEmoji: true,
            imageUrl: true,
          },
        },
      },
    });

    res.status(201).json({
      id: stamp.id,
      userId: stamp.userId,
      communityId: stamp.communityId,
      earnedAt: stamp.earnedAt.toISOString(),
      community: stamp.community,
    });
  } catch (err) {
    next(err);
  }
}

/** DELETE body/query: communityId — removes passport stamp. */
export async function deleteStampHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = (req.body ?? {}) as DeleteStampBody;
    const communityId = String(
      body.communityId ?? req.query.communityId ?? "",
    ).trim();
    if (!communityId) {
      res.status(400).json({ error: "communityId is required" });
      return;
    }

    const userId = (req as AuthenticatedRequest).userId;

    await prisma.stamp.deleteMany({
      where: { userId, communityId },
    });

    res.json({ stamped: false, communityId, userId });
  } catch (err) {
    next(err);
  }
}

/** POST /stamps/toggle — stamp or unstamp a community. */
export async function toggleStampHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as CreateStampBody;
    const communityId = body.communityId?.trim();
    if (!communityId) {
      res.status(400).json({ error: "communityId is required" });
      return;
    }

    const userId = (req as AuthenticatedRequest).userId;

    const existing = await prisma.stamp.findUnique({
      where: { userId_communityId: { userId, communityId } },
    });

    if (existing) {
      await prisma.stamp.delete({ where: { id: existing.id } });
      res.json({ stamped: false, communityId, userId });
      return;
    }

    const community = await prisma.community.findUnique({
      where: { id: communityId },
    });
    if (!community) {
      res.status(404).json({ error: "Community not found" });
      return;
    }

    const stamp = await prisma.stamp.create({
      data: { userId, communityId },
      include: {
        community: {
          select: {
            id: true,
            name: true,
            neighborhood: true,
            city: true,
            description: true,
            heroEmoji: true,
            imageUrl: true,
          },
        },
      },
    });

    res.status(201).json({
      stamped: true,
      id: stamp.id,
      userId: stamp.userId,
      communityId: stamp.communityId,
      earnedAt: stamp.earnedAt.toISOString(),
      community: stamp.community,
    });
  } catch (err) {
    next(err);
  }
}

export async function listUserStampsHandler(
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
    const stamps = await prisma.stamp.findMany({
      where: { userId: id },
      include: {
        community: {
          select: {
            id: true,
            name: true,
            neighborhood: true,
            city: true,
            description: true,
            heroEmoji: true,
            imageUrl: true,
          },
        },
      },
      orderBy: { earnedAt: "desc" },
    });

    res.json(
      stamps.map((s) => ({
        id: s.id,
        userId: s.userId,
        communityId: s.communityId,
        earnedAt: s.earnedAt.toISOString(),
        community: s.community,
      })),
    );
  } catch (err) {
    next(err);
  }
}
