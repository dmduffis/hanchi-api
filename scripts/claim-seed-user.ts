/**
 * Manually move seed-user-1 stamps/favorites/journal onto a Supabase Auth user id.
 *
 * Usage:
 *   npx tsx scripts/claim-seed-user.ts <auth-user-uuid> <email>
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const SEED_USER_ID = process.env.SEED_USER_ID?.trim() || "seed-user-1";

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

async function main() {
  const authId = process.argv[2]?.trim();
  const email = process.argv[3]?.trim().toLowerCase();

  if (!authId || !email) {
    console.error(
      "Usage: npx tsx scripts/claim-seed-user.ts <auth-user-uuid> <email>",
    );
    process.exit(1);
  }

  const seed = await prisma.user.findUnique({ where: { id: SEED_USER_ID } });
  if (!seed) {
    console.error(`No seed user ${SEED_USER_ID} to claim`);
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { id: authId } });
  if (existing) {
    console.error(`User ${authId} already exists — aborting`);
    process.exit(1);
  }

  const created = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: SEED_USER_ID },
      data: { email: `migrated-${SEED_USER_ID}@hanchi.invalid` },
    });

    const user = await tx.user.create({
      data: {
        id: authId,
        email,
        displayName: seed.displayName,
        intents: seed.intents,
        cultures: seed.cultures,
      },
    });

    const stamps = await tx.stamp.updateMany({
      where: { userId: SEED_USER_ID },
      data: { userId: authId },
    });
    const favorites = await tx.favorite.updateMany({
      where: { userId: SEED_USER_ID },
      data: { userId: authId },
    });
    const journal = await tx.journalEntry.updateMany({
      where: { userId: SEED_USER_ID },
      data: { userId: authId },
    });

    await tx.user.delete({ where: { id: SEED_USER_ID } });

    console.log("Moved", {
      stamps: stamps.count,
      favorites: favorites.count,
      journal: journal.count,
    });
    return user;
  });

  console.log("Claimed as", created.id, created.email, created.cultures);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
