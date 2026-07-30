/**
 * Geocode Wikipedia enclaves:
 * 1) Reuse cache hits
 * 2) Match City + State/Province against bundled centroids
 * 3) Nominatim fallback (polite, with 429 backoff)
 *
 * Usage: npx tsx scripts/geocode-wikipedia-enclaves.ts
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "data");
const PARSED = path.join(ROOT, "wikipedia-enclaves-parsed.json");
const CACHE = path.join(ROOT, "wikipedia-enclave-geocodes.json");
const CENTROIDS = path.join(ROOT, "us-ca-city-centroids.json");
const OUT = path.join(ROOT, "wikipedia-enclaves-ready.json");

type Parsed = {
  id: string;
  name: string;
  neighborhood: string;
  city: string;
  country: "US" | "CA";
  ethnicitySection: string;
  heroEmoji: string;
  countryCode: string | null;
  affinities: string[];
  yelpTerms: string[] | null;
  ethnicities: string[] | null;
  geocodeQuery: string;
  description: string;
  raw?: string;
};

type GeoCache = Record<
  string,
  | { lat: number; lng: number; displayName?: string; at: string; source?: string }
  | { error: string; at: string }
>;

const USER_AGENT = "SintaEnclaveImporter/1.0 (cultural discovery app)";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function deltaForSection(section: string): number {
  if (/china|mexico|india|philippines|vietnam|korea|japan/i.test(section)) {
    return 0.014;
  }
  return 0.012;
}

function normalizeKey(city: string, region: string): string {
  return `${city.trim().toLowerCase()}|${region.trim().toLowerCase()}`;
}

function loadCentroids(): Map<string, { lat: number; lng: number }> {
  const map = new Map<string, { lat: number; lng: number }>();
  if (!fs.existsSync(CENTROIDS)) return map;
  const rows = JSON.parse(fs.readFileSync(CENTROIDS, "utf8")) as {
    city: string;
    region: string;
    lat: number;
    lng: number;
  }[];
  for (const r of rows) {
    map.set(normalizeKey(r.city, r.region), { lat: r.lat, lng: r.lng });
    // Also allow full state name keys if region is abbreviation
  }
  return map;
}

const US_STATE_NAMES = new Set([
  "alabama","alaska","arizona","arkansas","california","colorado","connecticut",
  "delaware","florida","georgia","hawaii","idaho","illinois","indiana","iowa",
  "kansas","kentucky","louisiana","maine","maryland","massachusetts","michigan",
  "minnesota","mississippi","missouri","montana","nebraska","nevada",
  "new hampshire","new jersey","new mexico","new york","north carolina",
  "north dakota","ohio","oklahoma","oregon","pennsylvania","rhode island",
  "south carolina","south dakota","tennessee","texas","utah","vermont",
  "virginia","washington","west virginia","wisconsin","wyoming",
  "district of columbia","d.c.","dc",
]);

const CA_PROVINCE_NAMES = new Set([
  "alberta","british columbia","manitoba","new brunswick",
  "newfoundland and labrador","nova scotia","ontario","prince edward island",
  "quebec","saskatchewan",
]);

/** Extract likely city + region code/name from geocodeQuery / city / raw. */
function extractCityRegion(
  e: Parsed,
): { city: string; region: string }[] {
  const out: { city: string; region: string }[] = [];
  const push = (city: string, region: string) => {
    if (!city || !region) return;
    if (city.length > 60) return;
    out.push({ city: city.trim(), region: region.trim() });
  };

  const cityParts = e.city.split(",").map((s) => s.trim()).filter(Boolean);
  if (cityParts.length >= 2) push(cityParts[0]!, cityParts[1]!);

  const sources = [e.raw, e.geocodeQuery, e.neighborhood].filter(Boolean) as string[];
  for (const src of sources) {
    const parts = src.split(",").map((s) => s.trim()).filter(Boolean);
    for (let i = 0; i < parts.length - 1; i++) {
      const region = parts[i + 1]!.toLowerCase().replace(/\./g, "");
      if (US_STATE_NAMES.has(region) || CA_PROVINCE_NAMES.has(region)) {
        push(parts[i]!, parts[i + 1]!);
      }
    }
    // "X, City, State"
    if (parts.length >= 3) {
      const region = parts[parts.length - 1]!.toLowerCase().replace(/\./g, "");
      if (US_STATE_NAMES.has(region) || CA_PROVINCE_NAMES.has(region)) {
        push(parts[parts.length - 2]!, parts[parts.length - 1]!);
      }
    }
  }

  return out;
}

async function geocodeNominatim(
  query: string,
): Promise<{ lat: number; lng: number; displayName: string } | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });
  if (res.status === 429) {
    throw new Error("429");
  }
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const data = (await res.json()) as {
    lat: string;
    lon: string;
    display_name: string;
  }[];
  if (!data?.length) return null;
  const hit = data[0]!;
  return {
    lat: Number(hit.lat),
    lng: Number(hit.lon),
    displayName: hit.display_name,
  };
}

async function main() {
  const parsed = JSON.parse(fs.readFileSync(PARSED, "utf8")) as {
    enclaves: Parsed[];
  };
  const cache: GeoCache = fs.existsSync(CACHE)
    ? (JSON.parse(fs.readFileSync(CACHE, "utf8")) as GeoCache)
    : {};
  const centroids = loadCentroids();

  const ready: (Parsed & { lat: number; lng: number; delta: number })[] = [];
  const failed: { id: string; query: string; reason: string }[] = [];
  const needNominatim: Parsed[] = [];

  for (const e of parsed.enclaves) {
    const cached = cache[e.id];
    if (cached && "lat" in cached) {
      ready.push({
        ...e,
        lat: cached.lat,
        lng: cached.lng,
        delta: deltaForSection(e.ethnicitySection),
      });
      continue;
    }

    const candidates = extractCityRegion(e);
    let matched = false;
    for (const cr of candidates) {
      const hit = centroids.get(normalizeKey(cr.city, cr.region));
      if (hit) {
        cache[e.id] = {
          lat: hit.lat,
          lng: hit.lng,
          displayName: `${cr.city}, ${cr.region}`,
          at: new Date().toISOString(),
          source: "centroid",
        };
        ready.push({
          ...e,
          lat: hit.lat,
          lng: hit.lng,
          delta: deltaForSection(e.ethnicitySection),
        });
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Clear prior errors so Nominatim can retry
    if (cached && "error" in cached) delete cache[e.id];
    needNominatim.push(e);
  }

  console.log(
    `Cached/centroid ready: ${ready.length}. Nominatim remaining: ${needNominatim.length}`,
  );

  let nominatimDelay = 1500;
  for (let i = 0; i < needNominatim.length; i++) {
    const e = needNominatim[i]!;
    process.stdout.write(
      `[nominatim ${i + 1}/${needNominatim.length}] ${e.id}… `,
    );

    const cityRegion = extractCityRegion(e)[0];
    const attempts = [
      e.geocodeQuery,
      cityRegion ? `${cityRegion.city}, ${cityRegion.region}` : null,
    ].filter(Boolean) as string[];

    let resolved = false;
    for (const q of attempts) {
      try {
        await sleep(nominatimDelay);
        const hit = await geocodeNominatim(q);
        if (hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lng)) {
          cache[e.id] = {
            lat: hit.lat,
            lng: hit.lng,
            displayName: hit.displayName,
            at: new Date().toISOString(),
            source: "nominatim",
          };
          ready.push({
            ...e,
            lat: hit.lat,
            lng: hit.lng,
            delta: deltaForSection(e.ethnicitySection),
          });
          console.log(`${hit.lat.toFixed(4)}, ${hit.lng.toFixed(4)}`);
          nominatimDelay = 1500;
          resolved = true;
          break;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "error";
        if (msg === "429") {
          nominatimDelay = Math.min(nominatimDelay * 2, 20000);
          console.log(`429 → backoff ${nominatimDelay}ms`);
          await sleep(nominatimDelay);
        } else {
          console.log(msg);
        }
      }
    }

    if (!resolved) {
      cache[e.id] = { error: "not-found", at: new Date().toISOString() };
      failed.push({ id: e.id, query: e.geocodeQuery, reason: "not-found" });
      if (!String(process.stdout).includes("429")) console.log("miss");
    }

    if ((i + 1) % 10 === 0) {
      fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2));
    }
  }

  fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2));
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        count: ready.length,
        failed: failed.length,
        enclaves: ready,
        failedRows: failed,
      },
      null,
      2,
    ),
  );

  console.log(`\nReady: ${ready.length}  Failed: ${failed.length}`);
  console.log(`Wrote ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
