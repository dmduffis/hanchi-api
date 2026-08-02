/**
 * Fold empty wiki "Greenpoint in New York City" into curated Little Poland.
 * Drops the LES orphan pin first so it doesn't land on Little Poland.
 *
 * Usage: npx tsx scripts/merge-greenpoint-into-little-poland.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { orphanPoisOutsideCommunityBoundary } from "../src/lib/yelpSync";

const LOSER = "greenpoint-new-york-city";
const WINNER = "little-poland";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    ssl: { rejectUnauthorized: false },
  }),
});

async function main() {
  const [loser, winner] = await Promise.all([
    prisma.community.findUnique({ where: { id: LOSER } }),
    prisma.community.findUnique({ where: { id: WINNER } }),
  ]);
  if (!winner) throw new Error(`Winner missing: ${WINNER}`);
  if (!loser) {
    console.log(`already merged — ${LOSER} missing`);
    return;
  }

  // Drop out-of-area pins (e.g. Cafe Katja on Orchard St) before moving.
  const orphanedLoser = await orphanPoisOutsideCommunityBoundary(LOSER);
  console.log("orphaned outside greenpoint boundary", orphanedLoser);

  const moved = await prisma.poi.updateMany({
    where: { communityId: LOSER },
    data: { communityId: WINNER },
  });
  console.log("moved pois", moved.count);

  await prisma.stamp.updateMany({
    where: { communityId: LOSER },
    data: { communityId: WINNER },
  });
  await prisma.favorite.updateMany({
    where: { type: "community", targetId: LOSER },
    data: { targetId: WINNER },
  });
  await prisma.journalEntry.updateMany({
    where: { communityId: LOSER },
    data: { communityId: WINNER },
  });

  await prisma.community.delete({ where: { id: LOSER } });
  console.log(`deleted ${LOSER}`);

  const orphanedWinner = await orphanPoisOutsideCommunityBoundary(WINNER);
  console.log("orphaned outside little-poland boundary", orphanedWinner);

  const n = await prisma.poi.count({ where: { communityId: WINNER } });
  console.log(`${WINNER} pois now`, n);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
