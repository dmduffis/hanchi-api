/**
 * Remove low-quality Wikipedia community imports (city-level / malformed
 * rows like "Anaheim in Anaheim").
 *
 * Wikipedia is the source of truth for enclave coverage — this no longer
 * deletes wiki rows merely because a curated short-id community exists.
 * Use `communities:dedupe-wiki` to fold curated duplicates into wiki ids.
 *
 * Orphans POIs (communityId → null) before deleting doomed communities.
 *
 * Usage:
 *   npx tsx scripts/cleanup-wiki-communities.ts           # dry-run
 *   npx tsx scripts/cleanup-wiki-communities.ts --apply   # write
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { isJunkWikiCommunity } from "../src/lib/wikiCommunityQuality";

const apply = process.argv.includes("--apply");

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    ssl: { rejectUnauthorized: false },
  }),
});

const CURATED_SOURCE_FILES = [
  "scripts/resync-yelp-all.ts",
  "scripts/resync-nyc.ts",
  "scripts/add-detroit-communities.ts",
  "scripts/add-chicago-communities.ts",
  "scripts/add-la-communities.ts",
  "scripts/add-sf-communities.ts",
  "scripts/add-long-island-communities.ts",
  "scripts/data/five-metros-communities.ts",
  "scripts/data/florida-communities.ts",
  "scripts/data/connecticut-communities.ts",
  "scripts/data/minnesota-communities.ts",
  "prisma/seed.ts",
];

function loadCuratedIds(): Set<string> {
  const curated = new Set<string>();
  for (const rel of CURATED_SOURCE_FILES) {
    const full = path.join(__dirname, "..", rel);
    if (!fs.existsSync(full)) continue;
    const text = fs.readFileSync(full, "utf8");
    for (const m of text.matchAll(/id:\s*"([a-z0-9-]+)"/g)) {
      curated.add(m[1]);
    }
  }
  for (const id of [
    "yemeni-south-end-dearborn",
    "little-arabia-anaheim",
    "little-arabia-dearborn",
  ]) {
    curated.add(id);
  }
  return curated;
}

function reasonsFor(
  c: { id: string; name: string; neighborhood: string; city: string },
  curated: Set<string>,
): string[] {
  // Never delete curated catalog rows from this script.
  if (curated.has(c.id)) return [];
  const reasons: string[] = [];

  // Only drop junk/blob wiki rows. Do not remove wiki coverage that
  // overlaps curated catalogs — dedupe folds curated → wiki instead.
  if (isJunkWikiCommunity(c)) reasons.push("junk-or-blob");

  return reasons;
}

async function main() {
  const curated = loadCuratedIds();
  const all = await prisma.community.findMany({
    select: { id: true, name: true, neighborhood: true, city: true },
    orderBy: { id: "asc" },
  });

  const doomed = new Map<string, string[]>();
  for (const c of all) {
    const reasons = reasonsFor(c, curated);
    if (reasons.length) doomed.set(c.id, reasons);
  }

  let poiCount = 0;
  const samples: string[] = [];
  for (const [id, reasons] of doomed) {
    const n = await prisma.poi.count({ where: { communityId: id } });
    poiCount += n;
    if (samples.length < 40) {
      const row = all.find((c) => c.id === id)!;
      samples.push(
        `${n.toString().padStart(3)} pois | ${id} | ${row.name} | [${reasons.join(", ")}]`,
      );
    }
  }

  const reasonTallies: Record<string, number> = {};
  for (const reasons of doomed.values()) {
    for (const r of reasons) {
      const key = r.split(":")[0];
      reasonTallies[key] = (reasonTallies[key] ?? 0) + 1;
    }
  }

  console.log(apply ? "APPLY MODE" : "DRY RUN (pass --apply to write)");
  console.log(`curated kept: ${curated.size}`);
  console.log(`communities to remove: ${doomed.size}`);
  console.log(`POIs to orphan: ${poiCount}`);
  console.log("reason tallies:", reasonTallies);
  console.log("\nsamples:");
  for (const s of samples) console.log(" ", s);

  // Highlight the user's examples
  console.log("\nuser examples:");
  for (const id of [
    "anaheim-california",
    "anaheim-hills-in-anaheim-california",
    "little-arabia-anaheim",
    "little-arabia-anaheim-california",
    "philly-pino-town-philadelphia-pennsylvania",
  ]) {
    const row = all.find((c) => c.id === id);
    if (!row) {
      console.log(`  ${id}: not found`);
      continue;
    }
    const r = doomed.get(id);
    console.log(
      `  ${id}: ${r ? `REMOVE [${r.join(", ")}]` : "KEEP"} — ${row.name}`,
    );
  }

  if (!apply) return;

  let orphaned = 0;
  let deleted = 0;
  for (const id of doomed.keys()) {
    const pois = await prisma.poi.updateMany({
      where: { communityId: id },
      data: { communityId: null },
    });
    orphaned += pois.count;

    // Clear dependent community refs that would block delete.
    await prisma.stamp.deleteMany({ where: { communityId: id } });
    await prisma.journalEntry.updateMany({
      where: { communityId: id },
      data: { communityId: null },
    });
    await prisma.favorite.deleteMany({
      where: { type: "community", targetId: id },
    });

    await prisma.community.delete({ where: { id } });
    deleted += 1;
    if (deleted % 50 === 0) console.log(`  … deleted ${deleted}`);
  }

  console.log(`\nDone. deleted=${deleted} orphanedPois=${orphaned}`);
  const remaining = await prisma.community.count();
  console.log(`communities remaining: ${remaining}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
