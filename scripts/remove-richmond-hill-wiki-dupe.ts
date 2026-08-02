/**
 * Remove mislinked wiki "Richmond Hill in New York City".
 * Centroid was in Queens but every POI was outside (mostly Manhattan);
 * the real corridor is curated Little Guyana on Liberty Ave.
 *
 * Usage: npx tsx scripts/remove-richmond-hill-wiki-dupe.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const ID = "richmond-hill-queens-new-york-city";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    ssl: { rejectUnauthorized: false },
  }),
});

async function main() {
  const existing = await prisma.community.findUnique({ where: { id: ID } });
  if (!existing) {
    console.log("already removed", ID);
    return;
  }

  const orphaned = await prisma.poi.updateMany({
    where: { communityId: ID },
    data: { communityId: null },
  });
  console.log("orphaned pois", orphaned.count);

  const favs = await prisma.favorite.deleteMany({
    where: { type: "community", targetId: ID },
  });
  console.log("deleted favorites", favs.count);

  // Stamps cascade; journal communityId set null via FK.
  await prisma.community.delete({ where: { id: ID } });
  console.log("deleted", ID);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
