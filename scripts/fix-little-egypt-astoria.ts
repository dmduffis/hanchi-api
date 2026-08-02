/**
 * Fix Little Egypt (Astoria) map orphans:
 * - East Village "Zesty Tabbouleh" was linked and blew the fit SW
 * - Boundary was too far west (UES / East River) and too tight on Ditmars
 *
 * Usage: npx tsx scripts/fix-little-egypt-astoria.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { orphanPoisOutsideCommunityBoundary } from "../src/lib/yelpSync";

const ID = "astoria-queens-new-york";

/**
 * Steinway / Ditmars Astoria pocket — stays east of the East River
 * so Manhattan (UES, East Village) cannot sit inside the polygon.
 */
const BOUNDARY_WKT = `
POLYGON((
  -73.938 40.752,
  -73.900 40.752,
  -73.900 40.780,
  -73.938 40.780,
  -73.938 40.752
))
`.replace(/\s+/g, " ").trim();

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    ssl: { rejectUnauthorized: false },
  }),
});

async function main() {
  const community = await prisma.community.findUnique({ where: { id: ID } });
  if (!community) {
    throw new Error(`Community not found: ${ID}`);
  }
  console.log("community", community.id, community.name);

  await prisma.$executeRawUnsafe(
    `UPDATE "Community" SET boundary = ST_SetSRID(ST_GeomFromText($1), 4326) WHERE id = $2`,
    BOUNDARY_WKT,
    ID,
  );
  console.log("boundary tightened to Astoria Steinway/Ditmars box");

  const orphaned = await orphanPoisOutsideCommunityBoundary(ID);
  console.log("orphaned outside boundary", orphaned);

  const far = await prisma.$queryRawUnsafe<{ id: string; name: string; km: number }[]>(
    `
    SELECT p.id, p.name,
      ST_Distance(p.location::geography, ST_Centroid(c.boundary)::geography) / 1000 AS km
    FROM "Poi" p
    JOIN "Community" c ON c.id = p."communityId"
    WHERE p."communityId" = $1
      AND p.location IS NOT NULL
      AND ST_Distance(p.location::geography, ST_Centroid(c.boundary)::geography) > 3500
    ORDER BY km DESC
    `,
    ID,
  );
  if (far.length > 0) {
    const cleared = await prisma.poi.updateMany({
      where: { id: { in: far.map((r) => r.id) } },
      data: { communityId: null },
    });
    console.log(
      "orphaned >3.5km from centroid",
      cleared.count,
      far.map((r) => `${r.name} (${Number(r.km).toFixed(2)}km)`),
    );
  }

  const remaining = await prisma.$queryRawUnsafe<
    { total: number; outside: number; max_km: number }[]
  >(
    `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (
        WHERE NOT ST_Contains(c.boundary, p.location::geometry)
      )::int AS outside,
      COALESCE(
        MAX(ST_Distance(p.location::geography, ST_Centroid(c.boundary)::geography) / 1000),
        0
      ) AS max_km
    FROM "Poi" p
    JOIN "Community" c ON c.id = p."communityId"
    WHERE p."communityId" = $1 AND p.location IS NOT NULL
    `,
    ID,
  );
  console.log("remaining", remaining[0]);

  const sample = await prisma.$queryRawUnsafe<
    { name: string; address: string | null; km: number }[]
  >(
    `
    SELECT p.name, p.address,
      ST_Distance(p.location::geography, ST_Centroid(c.boundary)::geography) / 1000 AS km
    FROM "Poi" p
    JOIN "Community" c ON c.id = p."communityId"
    WHERE p."communityId" = $1 AND p.location IS NOT NULL
    ORDER BY km DESC
    LIMIT 8
    `,
    ID,
  );
  console.log("farthest kept:");
  for (const p of sample) {
    console.log(`  ${Number(p.km).toFixed(2)}km  ${p.name} — ${p.address}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
