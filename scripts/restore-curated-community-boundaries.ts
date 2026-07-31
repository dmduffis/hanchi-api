/**
 * Restore name/geo for curated seed communities that Wikipedia import
 * clobbered with city-level centroids (e.g. Flushing Chinatown → City Hall).
 *
 * Usage: npx tsx scripts/restore-curated-community-boundaries.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

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

/** Curated seed enclaves known to have been overwritten by NYC city centroid. */
const RESTORE = [
  {
    id: "chinatown-flushing",
    name: "Chinatown in Flushing",
    neighborhood: "Flushing, Queens",
    city: "New York",
    description:
      "One of the largest Chinatowns outside Asia. Main Street and Roosevelt hum with regional Chinese cuisines — Shanghainese, Taiwanese, Sichuan, and more.",
    heroEmoji: "🥟",
    lat: 40.759,
    lng: -73.83,
    delta: 0.012,
  },
  {
    id: "chinatown-sunset-park",
    name: "Chinatown in Sunset Park",
    neighborhood: "Brooklyn",
    city: "New York",
    description:
      "Brooklyn's Chinatown along 8th Avenue — dim sum mornings and a walk up to the park for harbor views.",
    heroEmoji: "🏯",
    lat: 40.641,
    lng: -74.009,
    delta: 0.008,
  },
  {
    id: "little-africa-si",
    name: "Little Africa in Staten Island",
    neighborhood: "Clifton, Staten Island",
    city: "New York",
    description:
      "Clifton's Little Africa — Liberian and West African restaurants, markets, and community life on the North Shore.",
    heroEmoji: "🌍",
    lat: 40.621,
    lng: -74.072,
    delta: 0.008,
  },
  {
    id: "little-africa-bronx",
    name: "Little Africa in the Bronx",
    neighborhood: "Bronx",
    city: "New York",
    description:
      "A growing West African corridor near 167th Street — stews, grilled meats, and weekend gatherings.",
    heroEmoji: "🥘",
    lat: 40.834,
    lng: -73.921,
    delta: 0.008,
  },
  {
    id: "little-senegal",
    name: "Little Senegal",
    neighborhood: "Harlem, Manhattan",
    city: "New York",
    description:
      "Le Petit Sénégal on West 116th — thieboudienne, fabric shops, and Wolof in the air.",
    heroEmoji: "🇸🇳",
    lat: 40.8029,
    lng: -73.9531,
    delta: 0.008,
  },
] as const;

function squarePolygonWkt(lat: number, lng: number, delta: number): string {
  const minLng = lng - delta;
  const maxLng = lng + delta;
  const minLat = lat - delta;
  const maxLat = lat + delta;
  return `POLYGON((${minLng} ${minLat}, ${maxLng} ${minLat}, ${maxLng} ${maxLat}, ${minLng} ${maxLat}, ${minLng} ${minLat}))`;
}

async function main() {
  console.log(`Restoring ${RESTORE.length} curated community boundaries…`);

  for (const c of RESTORE) {
    const existing = await prisma.community.findUnique({ where: { id: c.id } });
    if (!existing) {
      console.warn(`  skip missing ${c.id}`);
      continue;
    }

    await prisma.community.update({
      where: { id: c.id },
      data: {
        name: c.name,
        neighborhood: c.neighborhood,
        city: c.city,
        description: c.description,
        heroEmoji: c.heroEmoji,
      },
    });

    await prisma.$executeRawUnsafe(
      `UPDATE "Community" SET boundary = ST_SetSRID(ST_GeomFromText($1), 4326) WHERE id = $2`,
      squarePolygonWkt(c.lat, c.lng, c.delta),
      c.id,
    );

    console.log(`  ✓ ${c.id} → ${c.lat}, ${c.lng}`);
  }

  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
