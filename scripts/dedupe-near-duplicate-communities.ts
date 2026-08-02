/**
 * Prefer Wikipedia communities as the source of truth.
 *
 * - Collapses wiki id variants (Astoria ×3)
 * - Merges old curated rows into the matching wiki community
 * - Creates the wiki winner from wikipedia-enclaves-ready.json when missing
 *
 * Usage:
 *   npx tsx scripts/dedupe-near-duplicate-communities.ts           # dry-run
 *   npx tsx scripts/dedupe-near-duplicate-communities.ts --apply   # write
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { effectiveDelta } from "../src/lib/communityBounds";

const apply = process.argv.includes("--apply");
const READY = path.join(__dirname, "data", "wikipedia-enclaves-ready.json");

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    ssl: { rejectUnauthorized: false },
  }),
});

type ReadyEnclave = {
  id: string;
  name: string;
  neighborhood: string;
  city: string;
  description: string;
  heroEmoji: string;
  lat: number;
  lng: number;
  delta?: number;
};

/**
 * loser → wiki winner.
 * Curated short ids and wiki slug variants all fold into one Wikipedia row.
 */
const MERGES: Record<string, string> = {
  // Astoria: three wiki variants + curated Little Egypt → one wiki Astoria
  "astoria-queens-new-york-city": "astoria-queens-new-york",
  "astoria-queens-new-york-city-new-york": "astoria-queens-new-york",
  "little-egypt": "astoria-queens-new-york",

  // Same place, curated short id vs wiki id
  "chinatown-dc": "chinatown-washington-d-c",
  "little-ethiopia-dc": "little-ethiopia-shaw-washington-d-c",
  // NOTE: little-haiti (Flatbush) and little-haiti-miami are different places.
  "little-saigon-westminster": "little-saigon-orange-county-california",
  "tarpon-springs-greek": "greektown-tarpon-springs-florida",
  "scarborough-toronto-ontario": "scarborough-toronto",
  // Street-level wiki fragment → Jackson Heights Little Bangladesh
  "bangladesh-street-jackson-heights-queens-new-york-city-new-york":
    "little-bangladesh",
  // Same Hicksville pin as curated Little India
  "hicksville-new-york": "little-india-hicksville",
  // Wiki "Greenpoint" is the same Polish corridor as curated Little Poland
  "greenpoint-new-york-city": "little-poland",
  // Wiki "Richmond Hill" (India section) overlaps curated Little Guyana; do not
  // auto-merge POIs — Manhattan Indian orphans must be cleared first.
  "richmond-hill-queens-new-york-city": "little-guyana-queens",
};

function squarePolygonWkt(lat: number, lng: number, delta: number): string {
  const minLng = lng - delta;
  const maxLng = lng + delta;
  const minLat = lat - delta;
  const maxLat = lat + delta;
  return `POLYGON((${minLng} ${minLat}, ${maxLng} ${minLat}, ${maxLng} ${maxLat}, ${minLng} ${maxLat}, ${minLng} ${minLat}))`;
}

function loadReadyById(): Map<string, ReadyEnclave> {
  if (!fs.existsSync(READY)) return new Map();
  const payload = JSON.parse(fs.readFileSync(READY, "utf8")) as {
    enclaves: ReadyEnclave[];
  };
  return new Map(payload.enclaves.map((e) => [e.id, e]));
}

async function ensureWinner(
  winnerId: string,
  ready: Map<string, ReadyEnclave>,
): Promise<boolean> {
  const existing = await prisma.community.findUnique({
    where: { id: winnerId },
    select: { id: true },
  });
  if (existing) return true;

  const row = ready.get(winnerId);
  if (!row || !Number.isFinite(row.lat) || !Number.isFinite(row.lng)) {
    return false;
  }

  if (!apply) {
    console.log(`  would create wiki winner ${winnerId} from ready json`);
    return true;
  }

  await prisma.community.create({
    data: {
      id: row.id,
      name: row.name,
      neighborhood: row.neighborhood,
      city: row.city,
      description: row.description,
      heroEmoji: row.heroEmoji,
    },
  });
  await prisma.$executeRawUnsafe(
    `UPDATE "Community" SET boundary = ST_SetSRID(ST_GeomFromText($1), 4326) WHERE id = $2`,
    squarePolygonWkt(row.lat, row.lng, effectiveDelta(row.delta ?? 0.012)),
    row.id,
  );
  console.log(`  created wiki winner ${winnerId}`);
  return true;
}

async function mergeInto(
  loserId: string,
  winnerId: string,
): Promise<{ pois: number; stamps: number; favorites: number }> {
  const [winner, loser] = await Promise.all([
    prisma.community.findUnique({ where: { id: winnerId } }),
    prisma.community.findUnique({ where: { id: loserId } }),
  ]);
  if (!winner || !loser) {
    return { pois: 0, stamps: 0, favorites: 0 };
  }

  const pois = await prisma.poi.updateMany({
    where: { communityId: loserId },
    data: { communityId: winnerId },
  });

  const winnerStampUsers = new Set(
    (
      await prisma.stamp.findMany({
        where: { communityId: winnerId },
        select: { userId: true },
      })
    ).map((s) => s.userId),
  );
  const loserStamps = await prisma.stamp.findMany({
    where: { communityId: loserId },
    select: { id: true, userId: true },
  });
  const stampDupes = loserStamps
    .filter((s) => winnerStampUsers.has(s.userId))
    .map((s) => s.id);
  if (stampDupes.length) {
    await prisma.stamp.deleteMany({ where: { id: { in: stampDupes } } });
  }
  const stamps = await prisma.stamp.updateMany({
    where: { communityId: loserId },
    data: { communityId: winnerId },
  });

  const winnerFavUsers = new Set(
    (
      await prisma.favorite.findMany({
        where: { type: "community", targetId: winnerId },
        select: { userId: true },
      })
    ).map((f) => f.userId),
  );
  const loserFavs = await prisma.favorite.findMany({
    where: { type: "community", targetId: loserId },
    select: { id: true, userId: true },
  });
  const favDupes = loserFavs
    .filter((f) => winnerFavUsers.has(f.userId))
    .map((f) => f.id);
  if (favDupes.length) {
    await prisma.favorite.deleteMany({ where: { id: { in: favDupes } } });
  }
  const favorites = await prisma.favorite.updateMany({
    where: { type: "community", targetId: loserId },
    data: { targetId: winnerId },
  });

  await prisma.journalEntry.updateMany({
    where: { communityId: loserId },
    data: { communityId: winnerId },
  });

  await prisma.community.delete({ where: { id: loserId } });

  return {
    pois: pois.count,
    stamps: stamps.count,
    favorites: favorites.count,
  };
}

async function main() {
  console.log(apply ? "APPLY MODE" : "DRY RUN (pass --apply to write)");
  console.log("Wikipedia is source of truth — curated/wiki dupes fold into wiki ids.\n");

  const ready = loadReadyById();
  const plans: {
    loser: string;
    winner: string;
    loserPois: number;
    winnerPois: number;
  }[] = [];

  for (const [loser, winner] of Object.entries(MERGES)) {
    const loserRow = await prisma.community.findUnique({
      where: { id: loser },
      select: { id: true, name: true },
    });
    if (!loserRow) {
      console.log(`skip ${loser} → ${winner} (loser missing)`);
      continue;
    }

    const ok = await ensureWinner(winner, ready);
    if (!ok) {
      console.log(`skip ${loser} → ${winner} (wiki winner missing + not in ready)`);
      continue;
    }

    // In dry-run, winner may not exist yet — still plan the merge.
    const winnerPois = await prisma.poi.count({ where: { communityId: winner } });
    const loserPois = await prisma.poi.count({ where: { communityId: loser } });
    plans.push({ loser, winner, loserPois, winnerPois });
  }

  console.log(`\nmerges planned: ${plans.length}`);
  for (const p of plans) {
    console.log(
      `  ${p.loser} (${p.loserPois} pois) → ${p.winner} (${p.winnerPois} pois)`,
    );
  }

  if (!apply) return;

  let movedPois = 0;
  for (const p of plans) {
    const result = await mergeInto(p.loser, p.winner);
    movedPois += result.pois;
    console.log(
      `merged ${p.loser} → ${p.winner}: pois=${result.pois} stamps=${result.stamps} favs=${result.favorites}`,
    );
  }

  console.log(`\nDone. movedPois=${movedPois}`);
  for (const id of [
    "astoria-queens-new-york",
    "chinatown-washington-d-c",
    "little-ethiopia-shaw-washington-d-c",
    "little-haiti-miami",
    "little-saigon-orange-county-california",
  ]) {
    const c = await prisma.community.findUnique({
      where: { id },
      select: { name: true },
    });
    const n = c ? await prisma.poi.count({ where: { communityId: id } }) : 0;
    console.log(`  ${id}: ${c?.name ?? "MISSING"} · ${n} pois`);
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
