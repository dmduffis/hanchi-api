/**
 * Tag POIs whose name/category has an obvious Iraqi reference.
 *
 * Usage:
 *   npx tsx scripts/backfill-iraqi-tags.ts           # dry-run
 *   npx tsx scripts/backfill-iraqi-tags.ts --apply   # write
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { ethnicitiesFromText } from "../src/lib/ethnicities";

const apply = process.argv.includes("--apply");

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    ssl: { rejectUnauthorized: false },
  }),
});

const IRAQ_HINT =
  /\bchaldean\b|\bassyrian\b|\biraqi\b|\biraq\b|baghdad|babylon|babel\b|mosul|basra|nineveh|ninawa|erbil|kirkuk|najaf|karbala|mesopotam|tigris|euphrates|sumerian|\bmasgouf\b|\bquzi\b|\bqoozi\b/i;

async function main() {
  const pois = await prisma.poi.findMany({
    select: {
      id: true,
      name: true,
      category: true,
      ethnicities: true,
      communityId: true,
    },
  });

  let already = 0;
  let wouldTag = 0;
  const samples: string[] = [];

  for (const poi of pois) {
    const hay = `${poi.name} ${poi.category ?? ""}`;
    if (!IRAQ_HINT.test(hay)) continue;

    const inferred = ethnicitiesFromText(hay);
    if (!inferred.includes("iraqi")) continue;

    if (poi.ethnicities.includes("iraqi")) {
      already += 1;
      continue;
    }

    const next = [
      "iraqi",
      ...poi.ethnicities.filter((e) => e !== "iraqi"),
    ].slice(0, 2);

    wouldTag += 1;
    if (samples.length < 25) {
      samples.push(
        `${poi.name} [${poi.ethnicities.join("|") || "untagged"} → ${next.join("|")}] @ ${poi.communityId ?? "standalone"}`,
      );
    }

    if (apply) {
      await prisma.poi.update({
        where: { id: poi.id },
        data: { ethnicities: next },
      });
    }
  }

  console.log(apply ? "Applied." : "Dry-run (pass --apply to write).");
  console.log(`already iraqi: ${already}`);
  console.log(`${apply ? "newly tagged" : "would newly tag"}: ${wouldTag}`);
  for (const s of samples) console.log(`  ${s}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
