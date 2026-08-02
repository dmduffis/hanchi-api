import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import {
  getPoiWithGeometry,
  listCommunities,
  mapCommunitySummary,
  mapPoi,
} from "../lib/geo";

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
        const name = c.name.toLowerCase();
        const neighborhood = c.neighborhood.toLowerCase();
        const city = c.city.toLowerCase();
        const description = c.description.toLowerCase();
        let score = 0;
        if (name === needle) score = 1000;
        else if (name.startsWith(needle)) score = 850;
        else if (name.includes(needle)) score = 700;
        else if (neighborhood.includes(needle)) score = 500;
        else if (city.includes(needle)) score = 300;
        else if (description.includes(needle)) score = 100;
        else return null;
        return { row: c, score };
      })
      .filter((x): x is { row: (typeof allCommunities)[number]; score: number } => x != null)
      .sort((a, b) => b.score - a.score)
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
