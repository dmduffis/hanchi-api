/**
 * Daily Wikipedia-enclave Yelp sync — biggest / best-known first.
 *
 * Walks communities with few/no POIs (mostly Wikipedia imports), scores them
 * by metro fame + enclave name quality, and syncs until a daily Yelp call
 * budget is reached. Progress is persisted so you can re-run each day.
 *
 * Usage:
 *   npm run communities:daily-wiki-yelp            # sync next batch
 *   npm run communities:daily-wiki-yelp -- --status
 *   npm run communities:daily-wiki-yelp -- --dry-run
 *   npm run communities:daily-wiki-yelp -- --budget 300
 *
 * Env:
 *   YELP_DAILY_SYNC_BUDGET  default call budget (default 400)
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_COMMUNITY_SYNC_RADIUS_M,
  effectiveDelta,
} from "../src/lib/communityBounds";
import { WIKI_COMMUNITY_SEARCH_TERMS } from "../src/data/wikipediaYelpMeta";
import { YelpRateLimitError } from "../src/lib/yelp";
import { syncYelpForCommunity } from "../src/lib/yelpSync";

const READY_PATH = path.join(__dirname, "data", "wikipedia-enclaves-ready.json");
const PROGRESS_PATH = path.join(
  __dirname,
  "data",
  "wiki-yelp-daily-progress.json",
);

/** Already handled by curated metro scripts — never pick these up here. */
const SKIP_IDS = new Set([
  "little-arabia-dearborn",
  "yemeni-south-end-dearborn",
  "little-baghdad-sterling-heights",
  "banglatown-hamtramck",
  "mexicantown-detroit",
]);

/** Treat as done once it has at least this many POIs (unless --force). */
const MIN_POIS_DONE = 1;

const DEFAULT_BUDGET = Number(process.env.YELP_DAILY_SYNC_BUDGET ?? 400);

type ReadyEnclave = {
  id: string;
  delta?: number;
  yelpTerms?: string[] | null;
  country?: string;
  raw?: string;
  city?: string;
};

type ProgressEntry = {
  at: string;
  fetched: number;
  upserted: number;
  skipped: number;
  calls: number;
  priority: number;
};

type ProgressFile = {
  updatedAt: string | null;
  completed: Record<string, ProgressEntry>;
  failed: Record<string, { at: string; error: string }>;
  days: { date: string; calls: number; synced: number; stoppedReason?: string }[];
};

type RankedCommunity = {
  id: string;
  name: string;
  city: string;
  poiCount: number;
  priority: number;
  estCalls: number;
  delta: number;
  reasons: string[];
};

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    ssl: { rejectUnauthorized: false },
  }),
});

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadProgress(): ProgressFile {
  if (!fs.existsSync(PROGRESS_PATH)) {
    return { updatedAt: null, completed: {}, failed: {}, days: [] };
  }
  return JSON.parse(fs.readFileSync(PROGRESS_PATH, "utf8")) as ProgressFile;
}

function saveProgress(progress: ProgressFile): void {
  progress.updatedAt = new Date().toISOString();
  fs.writeFileSync(PROGRESS_PATH, `${JSON.stringify(progress, null, 2)}\n`);
}

function loadReadyById(): Map<string, ReadyEnclave> {
  const map = new Map<string, ReadyEnclave>();
  if (!fs.existsSync(READY_PATH)) return map;
  const payload = JSON.parse(fs.readFileSync(READY_PATH, "utf8")) as {
    enclaves: ReadyEnclave[];
  };
  for (const e of payload.enclaves) map.set(e.id, e);
  return map;
}

function squarePolygonWkt(lat: number, lng: number, delta: number): string {
  const minLng = lng - delta;
  const maxLng = lng + delta;
  const minLat = lat - delta;
  const maxLat = lat + delta;
  return `POLYGON((${minLng} ${minLat}, ${maxLng} ${minLat}, ${maxLng} ${maxLat}, ${minLng} ${maxLat}, ${minLng} ${minLat}))`;
}

/** Tier-1 US metros / famous diaspora cities. */
const TIER1 =
  /\b(new york|nyc|los angeles|\bla\b|chicago|san francisco|\bsf\b|houston|boston|seattle|washington|dallas|miami|philadelphia|atlanta|toronto|vancouver)\b/i;

/** Tier-2 large metros. */
const TIER2 =
  /\b(san diego|san jose|oakland|detroit|dearborn|minneapolis|st\.?\s*paul|orlando|tampa|phoenix|denver|portland|baltimore|sacramento|austin|charlotte|las vegas|cleveland|pittsburgh|cincinnati|kansas city|columbus|indianapolis|nashville|milwaukee|raleigh|richmond|jacksonville|buffalo|rochester|fresno|anaheim|santa ana|long beach|oakland|hamtramck|sterling heights|queens|brooklyn|bronx)\b/i;

const FAMOUS_ENCLAVE =
  /\b(chinatown|koreatown|japantown|little saigon|little italy|little tokyo|little ethiopia|little india|little arabia|greektown|thai town|filipinotown|banglatown|pilsen|devon avenue|argentinian|tehrangeles|olvera|historic filipino|poletown|corktown|mexicantown|bridgeview|annandale|eden center|hillcroft|argyle)\b/i;

const LITTLE_PREFIX = /\blittle[- ]/i;

const JUNK =
  /citation needed|etimated|estimated 10|000 yemenis|\\-|see also|distribution of|_citation|united states, united states|canada, canada|much of |other parts of |and other areas|metro area, united states$/i;

function scoreCommunity(input: {
  id: string;
  name: string;
  city: string;
  ready?: ReadyEnclave;
}): { priority: number; reasons: string[]; estCalls: number } {
  const hay = `${input.id} ${input.name} ${input.city} ${input.ready?.raw ?? ""}`;
  let priority = 0;
  const reasons: string[] = [];

  if (TIER1.test(hay)) {
    priority += 100;
    reasons.push("tier1-metro");
  } else if (TIER2.test(hay)) {
    priority += 70;
    reasons.push("tier2-metro");
  } else if (/\b(california|texas|florida|new york|illinois|massachusetts|washington|michigan|pennsylvania|ohio|georgia|virginia|maryland|new jersey|ontario|british columbia)\b/i.test(hay)) {
    priority += 25;
    reasons.push("major-state");
  }

  if (FAMOUS_ENCLAVE.test(hay)) {
    priority += 80;
    reasons.push("famous-enclave");
  } else if (LITTLE_PREFIX.test(hay) || LITTLE_PREFIX.test(input.name)) {
    priority += 40;
    reasons.push("little-enclave");
  }

  const terms =
    WIKI_COMMUNITY_SEARCH_TERMS[input.id] ??
    input.ready?.yelpTerms ??
    null;
  const termCount = Array.isArray(terms) && terms.length ? terms.length : 1;
  if (Array.isArray(terms) && terms.length) {
    priority += 15 + Math.min(terms.length, 4) * 5;
    reasons.push(`terms:${terms.length}`);
  } else {
    priority -= 10;
    reasons.push("generic-restaurants");
  }

  if ((input.ready?.country ?? "US") === "US") {
    priority += 15;
    reasons.push("us");
  } else if (/canada/i.test(hay)) {
    priority += 5;
    reasons.push("canada");
  }

  if (JUNK.test(hay) || JUNK.test(input.name) || JUNK.test(input.city)) {
    priority -= 120;
    reasons.push("junk-name");
  }

  // Prefer shorter, cleaner ids (malformed wiki dumps are long).
  if (input.id.length > 60) {
    priority -= 20;
    reasons.push("long-id");
  }

  return { priority, reasons, estCalls: termCount };
}

async function getCentroid(
  communityId: string,
): Promise<{ lat: number; lng: number } | null> {
  const rows = await prisma.$queryRawUnsafe<
    { lat: number | string | null; lng: number | string | null }[]
  >(
    `
    SELECT
      ST_Y(ST_Centroid(c.boundary)) AS lat,
      ST_X(ST_Centroid(c.boundary)) AS lng
    FROM "Community" c
    WHERE c.id = $1
    LIMIT 1
    `,
    communityId,
  );
  const row = rows[0];
  if (!row) return null;
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

async function rankQueue(opts: {
  force: boolean;
  progress: ProgressFile;
  readyById: Map<string, ReadyEnclave>;
}): Promise<RankedCommunity[]> {
  const rows = await prisma.$queryRawUnsafe<
    { id: string; name: string; city: string; poi_count: number }[]
  >(
    `
    SELECT
      c.id,
      c.name,
      c.city,
      (SELECT COUNT(*)::int FROM "Poi" p WHERE p."communityId" = c.id) AS poi_count
    FROM "Community" c
    WHERE c.boundary IS NOT NULL
    ORDER BY c.id ASC
    `,
  );

  const ranked: RankedCommunity[] = [];
  for (const row of rows) {
    if (SKIP_IDS.has(row.id)) continue;
    if (!opts.force) {
      if (row.poi_count >= MIN_POIS_DONE) continue;
      if (opts.progress.completed[row.id]) continue;
    }

    const ready = opts.readyById.get(row.id);
    const { priority, reasons, estCalls } = scoreCommunity({
      id: row.id,
      name: row.name,
      city: row.city,
      ready,
    });

    ranked.push({
      id: row.id,
      name: row.name,
      city: row.city,
      poiCount: row.poi_count,
      priority,
      estCalls,
      delta: ready?.delta ?? 0.012,
      reasons,
    });
  }

  ranked.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.id.localeCompare(b.id);
  });
  return ranked;
}

function parseArgs(argv: string[]) {
  const status = argv.includes("--status");
  const dryRun = argv.includes("--dry-run");
  const force = argv.includes("--force");
  const budgetIdx = argv.indexOf("--budget");
  const budget =
    budgetIdx >= 0 && argv[budgetIdx + 1]
      ? Number(argv[budgetIdx + 1])
      : DEFAULT_BUDGET;
  const limitIdx = argv.indexOf("--limit");
  const limit =
    limitIdx >= 0 && argv[limitIdx + 1]
      ? Number(argv[limitIdx + 1])
      : Infinity;
  return {
    status,
    dryRun,
    force,
    budget: Number.isFinite(budget) && budget > 0 ? budget : DEFAULT_BUDGET,
    limit: Number.isFinite(limit) && limit > 0 ? limit : Infinity,
  };
}

async function printStatus(
  queue: RankedCommunity[],
  progress: ProgressFile,
): Promise<void> {
  const done = Object.keys(progress.completed).length;
  const failed = Object.keys(progress.failed).length;
  const remainingCalls = queue.reduce((n, c) => n + c.estCalls, 0);
  console.log("Wikipedia → Yelp daily sync status");
  console.log(`  completed: ${done}`);
  console.log(`  failed:    ${failed}`);
  console.log(`  queued:    ${queue.length} (~${remainingCalls} Yelp calls)`);
  if (progress.days.length) {
    console.log("  recent days:");
    for (const d of progress.days.slice(-7)) {
      console.log(
        `    ${d.date}: synced=${d.synced} calls=${d.calls}${d.stoppedReason ? ` (${d.stoppedReason})` : ""}`,
      );
    }
  }
  console.log("\nNext up:");
  for (const c of queue.slice(0, 20)) {
    console.log(
      `  ${String(c.priority).padStart(3)}  ~${c.estCalls}c  ${c.id}  [${c.reasons.join(", ")}]`,
    );
  }
  if (queue.length > 20) console.log(`  … +${queue.length - 20} more`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const progress = loadProgress();
  const readyById = loadReadyById();
  const queue = await rankQueue({
    force: args.force,
    progress,
    readyById,
  });

  if (args.status) {
    await printStatus(queue, progress);
    return;
  }

  if (!queue.length) {
    console.log("Queue empty — all eligible Wikipedia communities are synced.");
    return;
  }

  // Pack today's batch under the call budget.
  const batch: RankedCommunity[] = [];
  let plannedCalls = 0;
  for (const c of queue) {
    if (batch.length >= args.limit) break;
    if (plannedCalls + c.estCalls > args.budget && batch.length > 0) break;
    if (c.estCalls > args.budget && batch.length === 0) {
      // Single oversized community — still take it alone.
      batch.push(c);
      plannedCalls += c.estCalls;
      break;
    }
    batch.push(c);
    plannedCalls += c.estCalls;
  }

  console.log(
    `${args.dryRun ? "DRY RUN — " : ""}Daily wiki Yelp sync`,
  );
  console.log(
    `  budget=${args.budget} calls  batch=${batch.length} communities  estCalls=${plannedCalls}`,
  );
  console.log(
    `  remaining after today ≈ ${queue.length - batch.length} communities\n`,
  );

  if (args.dryRun) {
    for (const c of batch) {
      console.log(
        `  would sync ${c.id} (priority=${c.priority}, ~${c.estCalls} calls) — ${c.reasons.join(", ")}`,
      );
    }
    return;
  }

  let usedCalls = 0;
  let synced = 0;
  let stoppedReason: string | undefined;

  for (const c of batch) {
    if (usedCalls + c.estCalls > args.budget && synced > 0) {
      stoppedReason = "budget";
      break;
    }

    try {
      const centroid = await getCentroid(c.id);
      if (!centroid) {
        progress.failed[c.id] = {
          at: new Date().toISOString(),
          error: "missing centroid/boundary",
        };
        console.log(`  ✗ ${c.id}: missing centroid`);
        continue;
      }

      await prisma.$executeRawUnsafe(
        `UPDATE "Community" SET boundary = ST_SetSRID(ST_GeomFromText($1), 4326) WHERE id = $2`,
        squarePolygonWkt(
          centroid.lat,
          centroid.lng,
          effectiveDelta(c.delta),
        ),
        c.id,
      );

      const before = await prisma.poi.count({ where: { communityId: c.id } });
      const result = await syncYelpForCommunity(c.id, {
        radiusMeters: DEFAULT_COMMUNITY_SYNC_RADIUS_M,
        limit: 50,
      });
      const after = await prisma.poi.count({ where: { communityId: c.id } });

      // syncYelpForCommunity issues one call per search term.
      usedCalls += c.estCalls;
      synced += 1;
      progress.completed[c.id] = {
        at: new Date().toISOString(),
        fetched: result.fetched,
        upserted: result.upserted,
        skipped: result.skipped,
        calls: c.estCalls,
        priority: c.priority,
      };
      delete progress.failed[c.id];

      console.log(
        `  ✓ ${c.id}: pois ${before}→${after} fetched=${result.fetched} upserted=${result.upserted} skipped=${result.skipped} (+${c.estCalls} calls, total ${usedCalls}/${args.budget})`,
      );
    } catch (err) {
      if (err instanceof YelpRateLimitError) {
        stoppedReason = "yelp-429";
        console.error(
          `  ⛔ Yelp rate limit — stopping. remaining=${err.remaining} reset=${err.resetTime}`,
        );
        break;
      }
      const message = err instanceof Error ? err.message : String(err);
      progress.failed[c.id] = {
        at: new Date().toISOString(),
        error: message,
      };
      console.error(`  ✗ ${c.id}: ${message}`);
      // Soft failures (bad geocode etc.) continue; hard auth errors stop.
      if (/401|403|YELP_API_KEY/i.test(message)) {
        stoppedReason = "auth";
        break;
      }
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  progress.days.push({
    date: todayUtc(),
    calls: usedCalls,
    synced,
    stoppedReason,
  });
  saveProgress(progress);

  const remaining = (await rankQueue({
    force: false,
    progress,
    readyById,
  })).length;

  console.log(`\nDay complete: synced=${synced} calls=${usedCalls}`);
  if (stoppedReason) console.log(`Stopped early: ${stoppedReason}`);
  console.log(`Remaining in queue: ${remaining}`);
  console.log(`Progress file: ${PROGRESS_PATH}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
