/**
 * Blank wiki auto-blurbs that only restate the title:
 * "X — a yemen cultural community in Y."
 *
 * Usage: npx tsx scripts/clear-boilerplate-descriptions.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { isBoilerplateWikiDescription } from "../src/lib/wikiCommunityQuality";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    ssl: { rejectUnauthorized: false },
  }),
});

async function main() {
  const rows = await prisma.community.findMany({
    select: { id: true, description: true },
  });
  const bad = rows.filter((r) => isBoilerplateWikiDescription(r.description));
  console.log("boilerplate rows", bad.length);
  for (const r of bad) {
    await prisma.community.update({
      where: { id: r.id },
      data: { description: "" },
    });
  }
  console.log("cleared", bad.length);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
