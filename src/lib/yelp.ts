export type YelpBusiness = {
  id: string;
  name: string;
  image_url?: string;
  url?: string;
  rating?: number;
  price?: string;
  categories?: { alias: string; title: string }[];
  location?: {
    address1?: string | null;
    city?: string | null;
    state?: string | null;
    zip_code?: string | null;
    display_address?: string[];
  };
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  hours?: {
    open?: { start: string; end: string; day: number }[];
    is_open_now?: boolean;
  }[];
};

type YelpSearchResponse = {
  businesses: YelpBusiness[];
  total: number;
};

function getYelpApiKey(): string {
  const key = process.env.YELP_API_KEY?.trim();
  if (!key) {
    throw new Error("YELP_API_KEY is not set");
  }
  return key;
}

export class YelpRateLimitError extends Error {
  readonly status = 429;
  readonly remaining: number | null;
  readonly resetTime: string | null;

  constructor(message: string, remaining: number | null, resetTime: string | null) {
    super(message);
    this.name = "YelpRateLimitError";
    this.remaining = remaining;
    this.resetTime = resetTime;
  }
}

export type YelpSearchResult = {
  businesses: YelpBusiness[];
  dailyRemaining: number | null;
  dailyLimit: number | null;
};

function parseHeaderInt(response: Response, name: string): number | null {
  const raw = response.headers.get(name);
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function searchYelpBusinesses(params: {
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  term?: string;
  categories?: string;
  limit?: number;
  offset?: number;
}): Promise<YelpBusiness[]> {
  const { businesses } = await searchYelpBusinessesDetailed(params);
  return businesses;
}

export async function searchYelpBusinessesDetailed(params: {
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  term?: string;
  categories?: string;
  limit?: number;
  offset?: number;
}): Promise<YelpSearchResult> {
  const url = new URL("https://api.yelp.com/v3/businesses/search");
  url.searchParams.set("latitude", String(params.latitude));
  url.searchParams.set("longitude", String(params.longitude));
  url.searchParams.set(
    "radius",
    String(Math.min(params.radiusMeters ?? 1500, 40000)),
  );
  url.searchParams.set("limit", String(Math.min(params.limit ?? 20, 50)));
  if (params.offset) url.searchParams.set("offset", String(params.offset));
  if (params.term) url.searchParams.set("term", params.term);
  url.searchParams.set(
    "categories",
    params.categories ?? "restaurants,food,cafes,gourmet",
  );

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${getYelpApiKey()}`,
      Accept: "application/json",
    },
  });

  const dailyRemaining = parseHeaderInt(response, "RateLimit-Remaining");
  const dailyLimit = parseHeaderInt(response, "RateLimit-DailyLimit");
  const resetTime = response.headers.get("RateLimit-ResetTime");

  if (response.status === 429) {
    const body = await response.text();
    throw new YelpRateLimitError(
      `Yelp daily rate limit hit: ${body}`,
      dailyRemaining,
      resetTime,
    );
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Yelp search failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as YelpSearchResponse;
  return {
    businesses: data.businesses ?? [],
    dailyRemaining,
    dailyLimit,
  };
}

export function formatYelpAddress(business: YelpBusiness): string | null {
  if (business.location?.display_address?.length) {
    return business.location.display_address.join(", ");
  }
  const parts = [
    business.location?.address1,
    business.location?.city,
    business.location?.state,
    business.location?.zip_code,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export function formatYelpCategory(business: YelpBusiness): string {
  return (
    business.categories?.map((c) => c.title).filter(Boolean).join(", ") ||
    "restaurant"
  );
}
