/**
 * Upsert geocoded Wikipedia enclaves without wiping existing data.
 * No Yelp sync in v1 (per plan).
 *
 * Usage: npm run communities:add-wikipedia
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { effectiveDelta } from "../src/lib/communityBounds";

const READY = path.join(__dirname, "data", "wikipedia-enclaves-ready.json");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const needsSsl =
  /supabase\.(co|com)/.test(connectionString) ||
  connectionString.includes("sslmode=require");

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString,
    ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
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
  delta: number;
};

function squarePolygonWkt(lat: number, lng: number, delta: number): string {
  const minLng = lng - delta;
  const maxLng = lng + delta;
  const minLat = lat - delta;
  const maxLat = lat + delta;
  return `POLYGON((${minLng} ${minLat}, ${maxLng} ${minLat}, ${maxLng} ${maxLat}, ${minLng} ${maxLat}, ${minLng} ${minLat}))`;
}

async function main() {
  if (!fs.existsSync(READY)) {
    throw new Error(
      `Missing ${READY}. Run parse-wikipedia-enclaves.ts then geocode-wikipedia-enclaves.ts first.`,
    );
  }

  const payload = JSON.parse(fs.readFileSync(READY, "utf8")) as {
    enclaves: ReadyEnclave[];
  };

  console.log(`Upserting ${payload.enclaves.length} Wikipedia enclaves…`);

  let created = 0;
  let skipped = 0;
  for (const c of payload.enclaves) {
    if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue;

    // Never overwrite curated seed communities (name/boundary). City-level
    // Wikipedia geocodes previously moved Flushing Chinatown to Manhattan.
    const existing = await prisma.community.findUnique({
      where: { id: c.id },
      select: { id: true },
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    await prisma.community.create({
      data: {
        id: c.id,
        name: c.name,
        neighborhood: c.neighborhood,
        city: c.city,
        description: c.description,
        heroEmoji: c.heroEmoji,
      },
    });

    await prisma.$executeRawUnsafe(
      `UPDATE "Community" SET boundary = ST_SetSRID(ST_GeomFromText($1), 4326) WHERE id = $2`,
      squarePolygonWkt(c.lat, c.lng, effectiveDelta(c.delta ?? 0.012)),
      c.id,
    );
    created += 1;
    if (created % 25 === 0) {
      console.log(`  … created ${created}, skipped ${skipped}`);
    }
  }

  console.log(`Done. Created ${created}, skipped existing ${skipped}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
