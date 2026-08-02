/**
 * Rename little-yemen-dearborn → yemeni-south-end-dearborn in the live DB.
 * Usage: npx tsx scripts/migrate-yemeni-south-end-id.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const OLD_ID = "little-yemen-dearborn";
const NEW_ID = "yemeni-south-end-dearborn";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    ssl: { rejectUnauthorized: false },
  }),
});

async function main() {
  const old = await prisma.community.findUnique({ where: { id: OLD_ID } });
  if (!old) {
    console.log(`No ${OLD_ID} row — nothing to migrate.`);
    return;
  }

  const existingNew = await prisma.community.findUnique({ where: { id: NEW_ID } });
  if (!existingNew) {
    await prisma.community.create({
      data: {
        id: NEW_ID,
        name: "Yemeni South End in Dearborn",
        neighborhood: "Salina / South End & Schaefer",
        city: old.city,
        description:
          "Metro Detroit's historic Yemeni community — South End roots around Salina since the Rouge Plant era, plus mandi houses, sabaya bakeries, and coffee chains along Schaefer and Michigan Avenue into Dearborn Heights.",
        heroEmoji: "🇾🇪",
      },
    });
    console.log(`created ${NEW_ID}`);
  }

  await prisma.$executeRawUnsafe(
    `UPDATE "Community" SET boundary = (SELECT boundary FROM "Community" WHERE id = $1) WHERE id = $2`,
    OLD_ID,
    NEW_ID,
  );

  const pois = await prisma.poi.updateMany({
    where: { communityId: OLD_ID },
    data: { communityId: NEW_ID },
  });
  console.log(`moved ${pois.count} pois`);

  const stamps = await prisma.stamp.updateMany({
    where: { communityId: OLD_ID },
    data: { communityId: NEW_ID },
  });
  console.log(`moved ${stamps.count} stamps`);

  const journal = await prisma.journalEntry.updateMany({
    where: { communityId: OLD_ID },
    data: { communityId: NEW_ID },
  });
  console.log(`moved ${journal.count} journal entries`);

  const favorites = await prisma.favorite.updateMany({
    where: { type: "community", targetId: OLD_ID },
    data: { targetId: NEW_ID },
  });
  console.log(`moved ${favorites.count} community favorites`);

  await prisma.community.delete({ where: { id: OLD_ID } });
  console.log(`deleted ${OLD_ID}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
