import type { User as AuthUser } from "@supabase/supabase-js";
import { prisma } from "./prisma";

const SEED_USER_ID = process.env.SEED_USER_ID?.trim() || "seed-user-1";

function claimEmails(): Set<string> {
  const raw =
    process.env.SEED_USER_CLAIM_EMAILS?.trim() || "explorer@hanchi.app";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

function displayNameFromAuth(authUser: AuthUser): string {
  const meta = authUser.user_metadata ?? {};
  const fromMeta =
    (typeof meta.display_name === "string" && meta.display_name.trim()) ||
    (typeof meta.full_name === "string" && meta.full_name.trim()) ||
    (typeof meta.name === "string" && meta.name.trim());
  if (fromMeta) return fromMeta;
  const email = authUser.email?.trim();
  if (email?.includes("@")) return email.split("@")[0]!;
  return "Explorer";
}

/**
 * Ensure a Prisma User row exists for the Supabase Auth user.
 * If the auth email is on the claim list, move seed-user stamps/favorites/journal
 * onto the real account (one-time migration off the stub user).
 */
export async function ensureAppUser(authUser: AuthUser) {
  const email = authUser.email?.trim().toLowerCase();
  if (!email) {
    throw new Error("Authenticated user is missing an email");
  }

  const existing = await prisma.user.findUnique({
    where: { id: authUser.id },
  });
  if (existing) {
    if (existing.email !== email) {
      return prisma.user.update({
        where: { id: authUser.id },
        data: { email },
      });
    }
    return existing;
  }

  const byEmail = await prisma.user.findUnique({ where: { email } });
  if (byEmail && byEmail.id !== authUser.id) {
    // Rare: row exists under a different id (legacy). Prefer auth UUID going forward.
    throw new Error(
      `User email ${email} is already linked to another account id`,
    );
  }

  const shouldClaim =
    claimEmails().has(email) &&
    (await prisma.user.findUnique({ where: { id: SEED_USER_ID } })) != null;

  if (shouldClaim) {
    return claimSeedUser(authUser.id, email, displayNameFromAuth(authUser));
  }

  return prisma.user.create({
    data: {
      id: authUser.id,
      email,
      displayName: displayNameFromAuth(authUser),
      intents: [],
      cultures: [],
    },
  });
}

async function claimSeedUser(
  authId: string,
  email: string,
  displayName: string,
) {
  return prisma.$transaction(async (tx) => {
    const seed = await tx.user.findUnique({ where: { id: SEED_USER_ID } });
    if (!seed) {
      return tx.user.create({
        data: {
          id: authId,
          email,
          displayName,
          intents: [],
          cultures: [],
        },
      });
    }

    // Free the unique email, create the real auth user, then move FKs.
    await tx.user.update({
      where: { id: SEED_USER_ID },
      data: { email: `migrated-${SEED_USER_ID}@hanchi.invalid` },
    });

    const created = await tx.user.create({
      data: {
        id: authId,
        email,
        displayName: seed.displayName || displayName,
        intents: seed.intents,
        cultures: seed.cultures,
      },
    });

    await tx.stamp.updateMany({
      where: { userId: SEED_USER_ID },
      data: { userId: authId },
    });
    await tx.favorite.updateMany({
      where: { userId: SEED_USER_ID },
      data: { userId: authId },
    });
    await tx.journalEntry.updateMany({
      where: { userId: SEED_USER_ID },
      data: { userId: authId },
    });

    await tx.user.delete({ where: { id: SEED_USER_ID } });
    return created;
  });
}
