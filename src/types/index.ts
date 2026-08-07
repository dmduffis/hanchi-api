import type { RouteType } from "@prisma/client";

export interface GeoJsonPoint {
  type: "Point";
  coordinates: [number, number]; // [lng, lat]
}

export interface GeoJsonPolygon {
  type: "Polygon";
  coordinates: number[][][];
}

export interface CommunitySummary {
  id: string;
  name: string;
  neighborhood: string;
  city: string;
  description: string;
  heroEmoji: string | null;
  imageUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  poiCount: number;
  distanceMeters?: number;
}

export interface PoiSummary {
  id: string;
  /** Null when the restaurant is not tied to an enclave. */
  communityId: string | null;
  name: string;
  category: string;
  address: string | null;
  hours: string | null;
  location?: GeoJsonPoint | null;
  yelpId?: string | null;
  rating?: number | null;
  priceLevel?: string | null;
  imageUrl?: string | null;
  yelpUrl?: string | null;
  ethnicities?: string[];
}

export interface DishDto {
  id: string;
  poiId: string;
  name: string;
  description: string | null;
  priceRange: string | null;
  imageUrl?: string | null;
  poiName?: string;
  communityId?: string | null;
  ethnicities?: string[];
}

export interface CommunityDetail extends CommunitySummary {
  boundary?: GeoJsonPolygon | null;
  pois: PoiSummary[];
}

export interface StampDto {
  id: string;
  userId: string;
  communityId: string;
  earnedAt: string;
  community?: CommunitySummary;
}

export interface JournalEntryDto {
  id: string;
  userId: string;
  communityId: string | null;
  poiId: string | null;
  note: string;
  photoUrl: string | null;
  photoUrls?: string[];
  createdAt: string;
  communityName?: string | null;
  poiName?: string | null;
  poi?: {
    id: string;
    name: string;
    communityId: string | null;
    category: string;
    ethnicities: string[];
  } | null;
}

export interface RouteStopDto {
  id: string;
  routeId: string;
  poiId: string;
  order: number;
  poi?: PoiSummary;
}

export interface RouteSummary {
  id: string;
  title: string;
  description: string | null;
  type: RouteType;
  createdAt: string;
  stopCount?: number;
}

export interface RouteDetail extends RouteSummary {
  stops: RouteStopDto[];
}

export interface SearchResults {
  query: string;
  communities: CommunitySummary[];
  pois: PoiSummary[];
  dishes: DishDto[];
}

export interface CreateStampBody {
  communityId: string;
  /** Optional; defaults to authenticated stub user (x-user-id). */
  userId?: string;
}

export interface DeleteStampBody {
  communityId: string;
  userId?: string;
}

export interface CreateJournalBody {
  note: string;
  communityId?: string | null;
  poiId?: string | null;
  /** @deprecated Free-form URLs rejected for UGC; use mediaIds. */
  photoUrl?: string | null;
  /** @deprecated Use mediaIds for multi-photo. */
  mediaId?: string | null;
  /** Up to 6 approved /media asset ids (purpose moment). */
  mediaIds?: string[] | null;
  /** Optional; defaults to authenticated stub user (x-user-id). */
  userId?: string;
}

export interface UpdateJournalBody {
  note?: string;
  communityId?: string | null;
  poiId?: string | null;
}

export interface ApiError {
  error: string;
}
