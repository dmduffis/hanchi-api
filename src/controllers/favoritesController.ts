import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import type { AuthenticatedRequest } from "../middleware/auth";
import {
  itemPayload,
  parseFavoriteType,
  resolveSaveTarget,
  type ResolvedSaveTarget,
} from "../lib/saveTargets";
import { ensureDefaultCollection } from "./collectionsController";

function favoritePayload(
  fav: { id: string; type: import("@prisma/client").FavoriteType; targetId: string; createdAt: Date },
  resolved: ResolvedSaveTarget,
  favorited?: boolean,
) {
  return {
    ...itemPayload(
      { id: fav.id, type: fav.type, targetId: fav.targetId, createdAt: fav.createdAt },
      resolved,
    ),
    ...(favorited !== undefined ? { favorited } : {}),
  };
}

async function addToDefaultCollection(
  userId: string,
  type: import("@prisma/client").FavoriteType,
  targetId: string,
) {
  const col = await ensureDefaultCollection(userId);
  await prisma.collectionItem.upsert({
    where: {
      collectionId_type_targetId: {
        collectionId: col.id,
        type,
        targetId,
      },
    },
    create: { collectionId: col.id, type, targetId },
    update: {},
  });
}

async function removeFromAllCollections(
  userId: string,
  type: import("@prisma/client").FavoriteType,
  targetId: string,
) {
  await prisma.collectionItem.deleteMany({
    where: {
      type,
      targetId,
      collection: { userId },
    },
  });
}

export async function listUserFavoritesHandler(
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

    // Prefer collection items (dedupe by type+targetId)
    await ensureDefaultCollection(id);
    const items = await prisma.collectionItem.findMany({
      where: { collection: { userId: id } },
      orderBy: { createdAt: "desc" },
    });

    const seen = new Set<string>();
    const payload = [];
    for (const it of items) {
      const key = `${it.type}:${it.targetId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const resolved = await resolveSaveTarget(it.type, it.targetId);
      if (!resolved.ok) continue;
      payload.push(
        favoritePayload(
          {
            id: it.id,
            type: it.type,
            targetId: it.targetId,
            createdAt: it.createdAt,
          },
          resolved,
        ),
      );
    }

    res.json(payload);
  } catch (err) {
    next(err);
  }
}

export async function createFavoriteHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const type = parseFavoriteType(req.body?.type);
    const targetId =
      typeof req.body?.targetId === "string" ? req.body.targetId.trim() : "";
    if (!type || !targetId) {
      res.status(400).json({ error: "type and targetId are required" });
      return;
    }

    const userId = (req as AuthenticatedRequest).userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const resolved = await resolveSaveTarget(type, targetId);
    if (!resolved.ok) {
      res.status(404).json({ error: "Favorite target not found" });
      return;
    }

    await addToDefaultCollection(userId, type, targetId);
    const favorite = await prisma.favorite.upsert({
      where: {
        userId_type_targetId: { userId, type, targetId },
      },
      create: { userId, type, targetId },
      update: {},
    });

    res.status(201).json(favoritePayload(favorite, resolved, true));
  } catch (err) {
    next(err);
  }
}

export async function deleteFavoriteHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const type = parseFavoriteType(req.body?.type ?? req.query.type);
    const targetId = String(
      req.body?.targetId ?? req.query.targetId ?? "",
    ).trim();
    if (!type || !targetId) {
      res.status(400).json({ error: "type and targetId are required" });
      return;
    }

    const userId = (req as AuthenticatedRequest).userId;
    await removeFromAllCollections(userId, type, targetId);
    await prisma.favorite.deleteMany({
      where: { userId, type, targetId },
    });

    res.json({ favorited: false, type, targetId });
  } catch (err) {
    next(err);
  }
}

export async function toggleFavoriteHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const type = parseFavoriteType(req.body?.type);
    const targetId =
      typeof req.body?.targetId === "string" ? req.body.targetId.trim() : "";
    if (!type || !targetId) {
      res.status(400).json({ error: "type and targetId are required" });
      return;
    }

    const userId = (req as AuthenticatedRequest).userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const resolved = await resolveSaveTarget(type, targetId);
    if (!resolved.ok) {
      res.status(404).json({ error: "Favorite target not found" });
      return;
    }

    const membership = await prisma.collectionItem.findFirst({
      where: {
        type,
        targetId,
        collection: { userId },
      },
    });

    if (membership) {
      await removeFromAllCollections(userId, type, targetId);
      await prisma.favorite.deleteMany({ where: { userId, type, targetId } });
      res.json({
        ...itemPayload(
          {
            id: membership.id,
            type,
            targetId,
            createdAt: membership.createdAt,
          },
          resolved,
        ),
        favorited: false,
      });
      return;
    }

    await addToDefaultCollection(userId, type, targetId);
    const favorite = await prisma.favorite.upsert({
      where: {
        userId_type_targetId: { userId, type, targetId },
      },
      create: { userId, type, targetId },
      update: {},
    });

    res.status(201).json(favoritePayload(favorite, resolved, true));
  } catch (err) {
    next(err);
  }
}
