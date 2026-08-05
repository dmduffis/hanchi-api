import { FavoriteType } from "@prisma/client";
import { prisma } from "./prisma";
import { getCommunityWithGeometry } from "./geo";

export type ResolvedSaveTarget = {
  ok: boolean;
  title?: string;
  subtitle?: string;
  communityId?: string | null;
  emoji?: string;
  restaurantId?: string;
  imageUrl?: string | null;
  ethnicities?: string[];
  latitude?: number | null;
  longitude?: number | null;
};

export function parseFavoriteType(value: unknown): FavoriteType | null {
  if (value === "community" || value === "restaurant" || value === "dish") {
    return value;
  }
  return null;
}

export async function resolveSaveTarget(
  type: FavoriteType,
  targetId: string,
): Promise<ResolvedSaveTarget> {
  if (type === "community") {
    const community = await getCommunityWithGeometry(targetId);
    if (!community) return { ok: false };
    const lat =
      community.latitude == null ? null : Number(community.latitude);
    const lng =
      community.longitude == null ? null : Number(community.longitude);
    return {
      ok: true,
      title: community.name,
      subtitle: community.neighborhood,
      communityId: community.id,
      emoji: community.heroEmoji ?? "📍",
      imageUrl: community.imageUrl,
      latitude: Number.isFinite(lat) ? lat : null,
      longitude: Number.isFinite(lng) ? lng : null,
    };
  }

  if (type === "restaurant") {
    const poi = await prisma.poi.findUnique({
      where: { id: targetId },
      include: { community: { select: { id: true, name: true } } },
    });
    if (!poi) return { ok: false };
    return {
      ok: true,
      title: poi.name,
      subtitle: poi.community
        ? `${poi.community.name} · Restaurant`
        : "Restaurant",
      communityId: poi.communityId,
      restaurantId: poi.id,
      emoji: "🍽️",
      imageUrl: poi.imageUrl,
      ethnicities: poi.ethnicities ?? [],
    };
  }

  const dish = await prisma.dish.findUnique({
    where: { id: targetId },
    include: {
      poi: {
        select: {
          id: true,
          name: true,
          communityId: true,
          imageUrl: true,
          ethnicities: true,
          community: { select: { name: true } },
        },
      },
    },
  });
  if (!dish) return { ok: false };
  return {
    ok: true,
    title: dish.name,
    subtitle: `${dish.poi.name} · Dish`,
    communityId: dish.poi.communityId,
    restaurantId: dish.poi.id,
    emoji: "🥢",
    imageUrl: dish.imageUrl ?? dish.poi.imageUrl,
    ethnicities: dish.poi.ethnicities ?? [],
  };
}

export function itemPayload(
  item: {
    id: string;
    type: FavoriteType;
    targetId: string;
    createdAt: Date;
    note?: string | null;
  },
  resolved: ResolvedSaveTarget,
) {
  return {
    id: item.id,
    type: item.type,
    targetId: item.targetId,
    title: resolved.title,
    subtitle: resolved.subtitle,
    communityId: resolved.communityId ?? null,
    restaurantId: resolved.restaurantId ?? null,
    emoji: resolved.emoji,
    imageUrl: resolved.imageUrl ?? null,
    ethnicities: resolved.ethnicities ?? [],
    latitude: resolved.latitude ?? null,
    longitude: resolved.longitude ?? null,
    note: item.note ?? null,
    savedAt: item.createdAt.toISOString(),
  };
}
