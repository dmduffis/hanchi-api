import { prisma } from "./prisma";
import type { GeoJsonPoint, GeoJsonPolygon } from "../types";

type CommunityRow = {
  id: string;
  name: string;
  neighborhood: string;
  city: string;
  description: string;
  heroEmoji: string | null;
  imageUrl: string | null;
  boundary_geojson: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  poi_count: number | string | null;
  distance_meters?: number | string | null;
};

type PoiRow = {
  id: string;
  communityId: string | null;
  name: string;
  category: string;
  address: string | null;
  hours: string | null;
  location_geojson: string | null;
  yelpId: string | null;
  rating: number | string | null;
  priceLevel: string | null;
  imageUrl: string | null;
  yelpUrl: string | null;
  ethnicities: string[] | null;
  distance_meters?: number | string | null;
};

const COMMUNITY_SELECT = `
  c.id,
  c.name,
  c.neighborhood,
  c.city,
  c.description,
  c."heroEmoji",
  c."imageUrl",
  ST_AsGeoJSON(c.boundary)::text AS boundary_geojson,
  ST_Y(ST_Centroid(c.boundary)) AS latitude,
  ST_X(ST_Centroid(c.boundary)) AS longitude,
  (SELECT COUNT(*)::int FROM "Poi" p WHERE p."communityId" = c.id) AS poi_count
`;

export function parseGeoJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function findCommunitiesNear(
  lat: number,
  lng: number,
  radiusMeters: number,
): Promise<CommunityRow[]> {
  return prisma.$queryRawUnsafe<CommunityRow[]>(
    `
    SELECT
      ${COMMUNITY_SELECT},
      ST_Distance(
        c.boundary::geography,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
      ) AS distance_meters
    FROM "Community" c
    WHERE c.boundary IS NOT NULL
      AND EXISTS (SELECT 1 FROM "Poi" p WHERE p."communityId" = c.id)
      AND ST_DWithin(
        c.boundary::geography,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
        $3
      )
    ORDER BY distance_meters ASC
    `,
    lng,
    lat,
    radiusMeters,
  );
}

/** List communities that have at least one restaurant/POI (hides foodless enclaves). */
export async function listCommunities(): Promise<CommunityRow[]> {
  return prisma.$queryRawUnsafe<CommunityRow[]>(
    `
    SELECT
      ${COMMUNITY_SELECT}
    FROM "Community" c
    WHERE EXISTS (SELECT 1 FROM "Poi" p WHERE p."communityId" = c.id)
    ORDER BY c.name ASC
    `,
  );
}

export async function getCommunityWithGeometry(
  id: string,
): Promise<CommunityRow | null> {
  const rows = await prisma.$queryRawUnsafe<CommunityRow[]>(
    `
    SELECT
      ${COMMUNITY_SELECT}
    FROM "Community" c
    WHERE c.id = $1
    LIMIT 1
    `,
    id,
  );
  return rows[0] ?? null;
}

export async function listPoisForCommunity(
  communityId: string,
): Promise<PoiRow[]> {
  return prisma.$queryRawUnsafe<PoiRow[]>(
    `
    SELECT
      p.id,
      p."communityId",
      p.name,
      p.category,
      p.address,
      p.hours,
      ST_AsGeoJSON(p.location)::text AS location_geojson,
      p."yelpId",
      p.rating,
      p."priceLevel",
      p."imageUrl",
      p."yelpUrl",
      p.ethnicities
    FROM "Poi" p
    WHERE p."communityId" = $1
    ORDER BY p.name ASC
    `,
    communityId,
  );
}

export async function getPoiWithGeometry(id: string): Promise<PoiRow | null> {
  const rows = await prisma.$queryRawUnsafe<PoiRow[]>(
    `
    SELECT
      p.id,
      p."communityId",
      p.name,
      p.category,
      p.address,
      p.hours,
      ST_AsGeoJSON(p.location)::text AS location_geojson,
      p."yelpId",
      p.rating,
      p."priceLevel",
      p."imageUrl",
      p."yelpUrl",
      p.ethnicities
    FROM "Poi" p
    WHERE p.id = $1
    LIMIT 1
    `,
    id,
  );
  return rows[0] ?? null;
}

export type ListPoisNearOpts = {
  lat: number;
  lng: number;
  radiusMeters: number;
  /** Match if POI ethnicities overlap any of these slugs. */
  ethnicities?: string[];
  /** When true, only POIs with no community. */
  unassignedOnly?: boolean;
  /** When set, only POIs for this community. */
  communityId?: string;
  limit?: number;
};

/** Ethnic restaurants near a point (enclave-bound and/or standalone). */
export async function listPoisNear(opts: ListPoisNearOpts): Promise<PoiRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 80, 1), 200);
  const ethnicities = opts.ethnicities?.filter(Boolean) ?? [];
  const params: unknown[] = [opts.lng, opts.lat, opts.radiusMeters, limit];
  const filters: string[] = [
    `p.location IS NOT NULL`,
    `ST_DWithin(
      p.location::geography,
      ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
      $3
    )`,
  ];

  if (opts.unassignedOnly) {
    filters.push(`p."communityId" IS NULL`);
  }
  if (opts.communityId) {
    params.push(opts.communityId);
    filters.push(`p."communityId" = $${params.length}`);
  }
  if (ethnicities.length > 0) {
    params.push(ethnicities);
    filters.push(`p.ethnicities && $${params.length}::text[]`);
  }

  return prisma.$queryRawUnsafe<PoiRow[]>(
    `
    SELECT
      p.id,
      p."communityId",
      p.name,
      p.category,
      p.address,
      p.hours,
      ST_AsGeoJSON(p.location)::text AS location_geojson,
      p."yelpId",
      p.rating,
      p."priceLevel",
      p."imageUrl",
      p."yelpUrl",
      p.ethnicities,
      ST_Distance(
        p.location::geography,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
      ) AS distance_meters
    FROM "Poi" p
    WHERE ${filters.join("\n      AND ")}
    ORDER BY distance_meters ASC
    LIMIT $4
    `,
    ...params,
  );
}

export function mapCommunitySummary(row: CommunityRow) {
  return {
    id: row.id,
    name: row.name,
    neighborhood: row.neighborhood,
    city: row.city,
    description: row.description,
    heroEmoji: row.heroEmoji,
    imageUrl: row.imageUrl,
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
    poiCount: toNumber(row.poi_count) ?? 0,
    ...(row.distance_meters != null
      ? { distanceMeters: toNumber(row.distance_meters) ?? undefined }
      : {}),
  };
}

export function mapCommunityDetail(
  row: CommunityRow,
  pois: ReturnType<typeof mapPoi>[],
) {
  return {
    ...mapCommunitySummary(row),
    boundary: parseGeoJson<GeoJsonPolygon>(row.boundary_geojson),
    pois,
  };
}

export function mapPoi(row: PoiRow) {
  return {
    id: row.id,
    communityId: row.communityId,
    name: row.name,
    category: row.category,
    address: row.address,
    hours: row.hours,
    location: parseGeoJson<GeoJsonPoint>(row.location_geojson),
    yelpId: row.yelpId,
    rating: toNumber(row.rating),
    priceLevel: row.priceLevel,
    imageUrl: row.imageUrl,
    yelpUrl: row.yelpUrl,
    ethnicities: Array.isArray(row.ethnicities)
      ? row.ethnicities.slice(0, 2)
      : [],
    ...(row.distance_meters != null
      ? { distanceMeters: toNumber(row.distance_meters) ?? undefined }
      : {}),
  };
}
