import type { Request, Response, NextFunction } from "express";
import type { Collection, CollectionVisibility, FavoriteType } from "@prisma/client";
import { randomBytes } from "crypto";
import { prisma } from "../lib/prisma";
import type { AuthenticatedRequest } from "../middleware/auth";
import {
  itemPayload,
  parseFavoriteType,
  resolveSaveTarget,
} from "../lib/saveTargets";

function newShareSlug(): string {
  return randomBytes(9).toString("base64url");
}

/** Ensure user has a default "Saved" collection; create if missing. */
export async function ensureDefaultCollection(
  userId: string,
): Promise<Collection> {
  const existing = await prisma.collection.findFirst({
    where: { userId, isDefault: true },
  });
  if (existing) return existing;

  return prisma.collection.create({
    data: {
      userId,
      name: "Saved",
      isDefault: true,
      visibility: "private",
      shareSlug: newShareSlug(),
    },
  });
}

async function collectionSummary(collection: Collection & { _count?: { items: number }; items?: { type: FavoriteType; targetId: string }[] }) {
  const itemCount =
    collection._count?.items ??
    (await prisma.collectionItem.count({ where: { collectionId: collection.id } }));

  // Cover thumbs: resolve up to 3 recent items for images
  const recent = await prisma.collectionItem.findMany({
    where: { collectionId: collection.id },
    orderBy: { createdAt: "desc" },
    take: 3,
  });
  const covers: (string | null)[] = [];
  for (const it of recent) {
    const r = await resolveSaveTarget(it.type, it.targetId);
    if (r.ok && r.imageUrl) covers.push(r.imageUrl);
    else if (r.ok) covers.push(null);
  }

  return {
    id: collection.id,
    name: collection.name,
    description: collection.description,
    visibility: collection.visibility,
    isDefault: collection.isDefault,
    shareSlug: collection.shareSlug,
    itemCount,
    coverImages: covers.filter(Boolean).slice(0, 3) as string[],
    createdAt: collection.createdAt.toISOString(),
    updatedAt: collection.updatedAt.toISOString(),
  };
}

function canViewCollection(
  collection: Collection,
  viewerId: string | undefined,
  viaSlug: boolean,
): boolean {
  if (viewerId && collection.userId === viewerId) return true;
  if (collection.visibility === "public") return true;
  if (viaSlug) return true; // private still open via share link
  return false;
}

/** GET /collections — mine */
export async function listMyCollectionsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    await ensureDefaultCollection(userId);
    const rows = await prisma.collection.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
      include: { _count: { select: { items: true } } },
    });
    const list = await Promise.all(rows.map((c) => collectionSummary(c)));
    res.json(list);
  } catch (err) {
    next(err);
  }
}

/** POST /collections */
export async function createCollectionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const name =
      typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const description =
      typeof req.body?.description === "string"
        ? req.body.description.trim() || null
        : null;
    const visibility: CollectionVisibility =
      req.body?.visibility === "public" ? "public" : "private";

    await ensureDefaultCollection(userId);
    const created = await prisma.collection.create({
      data: {
        userId,
        name: name.slice(0, 80),
        description: description?.slice(0, 280) ?? null,
        visibility,
        isDefault: false,
        shareSlug: newShareSlug(),
      },
      include: { _count: { select: { items: true } } },
    });
    res.status(201).json(await collectionSummary(created));
  } catch (err) {
    next(err);
  }
}

/** GET /collections/membership?type=&targetId= */
export async function membershipHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const type = parseFavoriteType(req.query.type);
    const targetId = String(req.query.targetId ?? "").trim();
    if (!type || !targetId) {
      res.status(400).json({ error: "type and targetId are required" });
      return;
    }

    const items = await prisma.collectionItem.findMany({
      where: {
        type,
        targetId,
        collection: { userId },
      },
      select: { collectionId: true },
    });
    const collectionIds = items.map((i) => i.collectionId);
    res.json({
      saved: collectionIds.length > 0,
      collectionIds,
    });
  } catch (err) {
    next(err);
  }
}

/** POST /collections/save — smart save / toggle / multi-list set */
export async function smartSaveHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const type = parseFavoriteType(req.body?.type);
    const targetId =
      typeof req.body?.targetId === "string" ? req.body.targetId.trim() : "";
    if (!type || !targetId) {
      res.status(400).json({ error: "type and targetId are required" });
      return;
    }

    const resolved = await resolveSaveTarget(type, targetId);
    if (!resolved.ok) {
      res.status(404).json({ error: "Target not found" });
      return;
    }

    await ensureDefaultCollection(userId);
    const mine = await prisma.collection.findMany({
      where: { userId },
      select: { id: true },
    });
    const collectionIdsBody = Array.isArray(req.body?.collectionIds)
      ? (req.body.collectionIds as unknown[])
          .filter((id): id is string => typeof id === "string")
          .map((id) => id.trim())
          .filter(Boolean)
      : null;

    // Explicit multi-list set from save sheet
    if (collectionIdsBody) {
      const allowed = new Set(mine.map((c) => c.id));
      const wanted = collectionIdsBody.filter((id) => allowed.has(id));

      await prisma.$transaction(async (tx) => {
        // Remove from all of mine first
        await tx.collectionItem.deleteMany({
          where: {
            type,
            targetId,
            collectionId: { in: [...allowed] },
          },
        });
        for (const collectionId of wanted) {
          await tx.collectionItem.upsert({
            where: {
              collectionId_type_targetId: { collectionId, type, targetId },
            },
            create: { collectionId, type, targetId },
            update: {},
          });
        }
      });

      // Keep legacy Favorite in sync for any leftover callers
      if (wanted.length > 0) {
        await prisma.favorite.upsert({
          where: { userId_type_targetId: { userId, type, targetId } },
          create: { userId, type, targetId },
          update: {},
        });
      } else {
        await prisma.favorite.deleteMany({ where: { userId, type, targetId } });
      }

      res.json({
        saved: wanted.length > 0,
        collectionIds: wanted,
        needsPicker: false,
      });
      return;
    }

    // Smart toggle: 0–1 collections → toggle; 2+ → needs picker
    if (mine.length >= 2) {
      res.status(400).json({
        error: "needs_picker",
        needsPicker: true,
        collectionCount: mine.length,
      });
      return;
    }

    const onlyId = mine[0]?.id;
    if (!onlyId) {
      res.status(500).json({ error: "No collection available" });
      return;
    }

    const existing = await prisma.collectionItem.findUnique({
      where: {
        collectionId_type_targetId: {
          collectionId: onlyId,
          type,
          targetId,
        },
      },
    });

    if (existing) {
      await prisma.collectionItem.delete({ where: { id: existing.id } });
      await prisma.favorite.deleteMany({ where: { userId, type, targetId } });
      res.json({ saved: false, collectionIds: [], needsPicker: false });
      return;
    }

    await prisma.collectionItem.create({
      data: { collectionId: onlyId, type, targetId },
    });
    await prisma.favorite.upsert({
      where: { userId_type_targetId: { userId, type, targetId } },
      create: { userId, type, targetId },
      update: {},
    });
    res.status(201).json({
      saved: true,
      collectionIds: [onlyId],
      needsPicker: false,
    });
  } catch (err) {
    next(err);
  }
}

/** GET /collections/following */
export async function listFollowingHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const follows = await prisma.collectionFollow.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        collection: {
          include: {
            user: { select: { id: true, displayName: true } },
            _count: { select: { items: true } },
          },
        },
      },
    });

    const out = await Promise.all(
      follows.map(async (f) => {
        const summary = await collectionSummary(f.collection);
        return {
          ...summary,
          owner: {
            id: f.collection.user.id,
            displayName: f.collection.user.displayName,
          },
          followedAt: f.createdAt.toISOString(),
        };
      }),
    );
    res.json(out);
  } catch (err) {
    next(err);
  }
}

/** GET /collections/by-slug/:shareSlug */
export async function getBySlugHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const slug = String(req.params.shareSlug ?? "").trim();
    if (!slug) {
      res.status(400).json({ error: "shareSlug required" });
      return;
    }
    const collection = await prisma.collection.findUnique({
      where: { shareSlug: slug },
      include: {
        user: { select: { id: true, displayName: true } },
        items: { orderBy: { createdAt: "desc" } },
        _count: { select: { items: true, followers: true } },
      },
    });
    if (!collection) {
      res.status(404).json({ error: "Collection not found" });
      return;
    }

    const viewerId = (req as AuthenticatedRequest).userId;
    // by-slug always viaSlug
    if (!canViewCollection(collection, viewerId, true)) {
      res.status(404).json({ error: "Collection not found" });
      return;
    }

    const items = (
      await Promise.all(
        collection.items.map(async (it) => {
          const resolved = await resolveSaveTarget(it.type, it.targetId);
          if (!resolved.ok) return null;
          return itemPayload(it, resolved);
        }),
      )
    ).filter(Boolean);

    let following = false;
    if (viewerId && viewerId !== collection.userId) {
      const fol = await prisma.collectionFollow.findUnique({
        where: {
          userId_collectionId: {
            userId: viewerId,
            collectionId: collection.id,
          },
        },
      });
      following = Boolean(fol);
    }

    res.json({
      id: collection.id,
      name: collection.name,
      description: collection.description,
      visibility: collection.visibility,
      isDefault: collection.isDefault,
      shareSlug: collection.shareSlug,
      itemCount: collection._count.items,
      followerCount: collection._count.followers,
      owner: {
        id: collection.user.id,
        displayName: collection.user.displayName,
      },
      isOwner: viewerId === collection.userId,
      following,
      items,
      createdAt: collection.createdAt.toISOString(),
      updatedAt: collection.updatedAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

/** GET /collections/:id */
export async function getCollectionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = req.params.id;
    const viewerId = (req as AuthenticatedRequest).userId;
    const collection = await prisma.collection.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, displayName: true } },
        items: { orderBy: { createdAt: "desc" } },
        _count: { select: { items: true, followers: true } },
      },
    });
    if (!collection) {
      res.status(404).json({ error: "Collection not found" });
      return;
    }
    const isOwner = collection.userId === viewerId;
    if (!canViewCollection(collection, viewerId, false) && !isOwner) {
      res.status(404).json({ error: "Collection not found" });
      return;
    }

    const items = (
      await Promise.all(
        collection.items.map(async (it) => {
          const resolved = await resolveSaveTarget(it.type, it.targetId);
          if (!resolved.ok) return null;
          return itemPayload(it, resolved);
        }),
      )
    ).filter(Boolean);

    let following = false;
    if (viewerId && !isOwner) {
      const fol = await prisma.collectionFollow.findUnique({
        where: {
          userId_collectionId: {
            userId: viewerId,
            collectionId: collection.id,
          },
        },
      });
      following = Boolean(fol);
    }

    res.json({
      id: collection.id,
      name: collection.name,
      description: collection.description,
      visibility: collection.visibility,
      isDefault: collection.isDefault,
      shareSlug: collection.shareSlug,
      itemCount: collection._count.items,
      followerCount: collection._count.followers,
      owner: {
        id: collection.user.id,
        displayName: collection.user.displayName,
      },
      isOwner,
      following,
      items,
      createdAt: collection.createdAt.toISOString(),
      updatedAt: collection.updatedAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

/** PATCH /collections/:id */
export async function updateCollectionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const id = req.params.id;
    const collection = await prisma.collection.findUnique({ where: { id } });
    if (!collection || collection.userId !== userId) {
      res.status(404).json({ error: "Collection not found" });
      return;
    }

    const data: {
      name?: string;
      description?: string | null;
      visibility?: CollectionVisibility;
    } = {};

    if (typeof req.body?.name === "string" && req.body.name.trim()) {
      data.name = req.body.name.trim().slice(0, 80);
    }
    if (req.body?.description !== undefined) {
      data.description =
        typeof req.body.description === "string"
          ? req.body.description.trim().slice(0, 280) || null
          : null;
    }
    if (req.body?.visibility === "public" || req.body?.visibility === "private") {
      data.visibility = req.body.visibility;
    }

    const updated = await prisma.collection.update({
      where: { id },
      data,
      include: { _count: { select: { items: true } } },
    });
    res.json(await collectionSummary(updated));
  } catch (err) {
    next(err);
  }
}

/** DELETE /collections/:id */
export async function deleteCollectionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const id = req.params.id;
    const collection = await prisma.collection.findUnique({ where: { id } });
    if (!collection || collection.userId !== userId) {
      res.status(404).json({ error: "Collection not found" });
      return;
    }
    if (collection.isDefault) {
      res.status(400).json({ error: "Cannot delete the default Saved list" });
      return;
    }
    await prisma.collection.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

/** POST /collections/:id/items */
export async function addItemHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const id = req.params.id;
    const type = parseFavoriteType(req.body?.type);
    const targetId =
      typeof req.body?.targetId === "string" ? req.body.targetId.trim() : "";
    if (!type || !targetId) {
      res.status(400).json({ error: "type and targetId are required" });
      return;
    }

    const collection = await prisma.collection.findUnique({ where: { id } });
    if (!collection || collection.userId !== userId) {
      res.status(404).json({ error: "Collection not found" });
      return;
    }

    const resolved = await resolveSaveTarget(type, targetId);
    if (!resolved.ok) {
      res.status(404).json({ error: "Target not found" });
      return;
    }

    const note =
      typeof req.body?.note === "string"
        ? req.body.note.trim().slice(0, 280) || null
        : null;

    const item = await prisma.collectionItem.upsert({
      where: {
        collectionId_type_targetId: {
          collectionId: id,
          type,
          targetId,
        },
      },
      create: { collectionId: id, type, targetId, note },
      update: note !== null ? { note } : {},
    });

    await prisma.favorite.upsert({
      where: { userId_type_targetId: { userId, type, targetId } },
      create: { userId, type, targetId },
      update: {},
    });

    res.status(201).json(itemPayload(item, resolved));
  } catch (err) {
    next(err);
  }
}

/** DELETE /collections/:id/items */
export async function removeItemHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const id = req.params.id;
    const type = parseFavoriteType(req.body?.type ?? req.query.type);
    const targetId = String(
      req.body?.targetId ?? req.query.targetId ?? "",
    ).trim();
    if (!type || !targetId) {
      res.status(400).json({ error: "type and targetId are required" });
      return;
    }

    const collection = await prisma.collection.findUnique({ where: { id } });
    if (!collection || collection.userId !== userId) {
      res.status(404).json({ error: "Collection not found" });
      return;
    }

    await prisma.collectionItem.deleteMany({
      where: { collectionId: id, type, targetId },
    });

    // Drop legacy favorite if no membership remains
    const remaining = await prisma.collectionItem.count({
      where: {
        type,
        targetId,
        collection: { userId },
      },
    });
    if (remaining === 0) {
      await prisma.favorite.deleteMany({ where: { userId, type, targetId } });
    }

    res.json({ removed: true, type, targetId });
  } catch (err) {
    next(err);
  }
}

/** POST /collections/:id/follow */
export async function followCollectionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const id = req.params.id;
    const collection = await prisma.collection.findUnique({ where: { id } });
    if (!collection) {
      res.status(404).json({ error: "Collection not found" });
      return;
    }
    if (collection.userId === userId) {
      res.status(400).json({ error: "Cannot follow your own collection" });
      return;
    }
    // Follow public only (or allow if already has access via public)
    if (collection.visibility !== "public") {
      res.status(403).json({ error: "Can only follow public collections" });
      return;
    }

    await prisma.collectionFollow.upsert({
      where: {
        userId_collectionId: { userId, collectionId: id },
      },
      create: { userId, collectionId: id },
      update: {},
    });
    res.status(201).json({ following: true, collectionId: id });
  } catch (err) {
    next(err);
  }
}

/** DELETE /collections/:id/follow */
export async function unfollowCollectionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const id = req.params.id;
    await prisma.collectionFollow.deleteMany({
      where: { userId, collectionId: id },
    });
    res.json({ following: false, collectionId: id });
  } catch (err) {
    next(err);
  }
}
