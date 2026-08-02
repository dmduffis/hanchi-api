import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import {
  getPoiWithGeometry,
  listCommunities,
  mapCommunitySummary,
  mapPoi,
} from "../lib/geo";
import { isBrandedEnclaveName } from "../lib/wikiCommunityQuality";

/** Strip " in {City…}" so metro queries don't over-match wiki titles. */
function nameCore(name: string): string {
  return name.replace(/\s+in\s+.+$/i, "").trim();
}

function scoreCommunityMatch(
  c: { name: string; neighborhood: string; city: string; description: string },
  needle: string,
): number | null {
  const name = c.name.toLowerCase();
  const core = nameCore(c.name).toLowerCase();
  const neighborhood = c.neighborhood.toLowerCase();
  const city = c.city.toLowerCase();
  const description = c.description.toLowerCase();
  const branded = isBrandedEnclaveName(c.name);

  if (name === needle || core === needle) return 1000;
  if (core.startsWith(needle) || name.startsWith(needle)) return 850;
  // Match on the enclave label itself ("Little Bangladesh"), not only
  // the trailing " in New York City" that every NYC wiki row carries.
  if (core.includes(needle)) return branded ? 780 : 700;
  if (name.includes(needle) && !core.includes(needle)) {
    // "Bangladesh Street in New York City" for q=new york → demote hard.
    return branded ? 360 : 60;
  }
  if (neighborhood.includes(needle)) return branded ? 520 : 480;
  if (city.includes(needle)) return branded ? 420 : 200;
  if (description.includes(needle)) return branded ? 140 : 40;
  return null;
}

export async function searchHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!q) {
      res.status(400).json({ error: "Query param q is required" });
      return;
    }

    const needle = q.toLowerCase();

    const [allCommunities, pois, dishes] = await Promise.all([
      listCommunities(),
      prisma.poi.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { category: { contains: q, mode: "insensitive" } },
            { address: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 20,
        orderBy: { name: "asc" },
      }),
      prisma.dish.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        },
        include: {
          poi: {
            select: {
              name: true,
              communityId: true,
              ethnicities: true,
            },
          },
        },
        take: 20,
        orderBy: { name: "asc" },
      }),
    ]);

    const communities = allCommunities
      .map((c) => {
        const score = scoreCommunityMatch(c, needle);
        if (score == null || score < 100) return null;
        return { row: c, score };
      })
      .filter(
        (x): x is { row: (typeof allCommunities)[number]; score: number } =>
          x != null,
      )
      .sort((a, b) => b.score - a.score || a.row.name.localeCompare(b.row.name))
      .slice(0, 20)
      .map(({ row }) => mapCommunitySummary(row));

    const poiResults = await Promise.all(
      pois.map(async (p) => {
        const row = await getPoiWithGeometry(p.id);
        return row
          ? mapPoi(row)
          : {
              id: p.id,
              communityId: p.communityId,
              name: p.name,
              category: p.category,
              address: p.address,
              hours: p.hours,
              location: null,
            };
      }),
    );

    res.json({
      query: q,
      communities,
      pois: poiResults,
      dishes: dishes.map((d) => ({
        id: d.id,
        poiId: d.poiId,
        name: d.name,
        description: d.description,
        priceRange: d.priceRange,
        imageUrl: d.imageUrl,
        poiName: d.poi.name,
        communityId: d.poi.communityId,
        ethnicities: Array.isArray(d.poi.ethnicities)
          ? d.poi.ethnicities.slice(0, 2)
          : [],
      })),
    });
  } catch (err) {
    next(err);
  }
}
