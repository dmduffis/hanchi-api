/**
 * Enclave polygons are authored as small squares around a pin.
 * Apply a widen factor so Yelp sync can capture corridor restaurants
 * without hand-tuning every metro.
 */
export const BOUNDARY_WIDEN = 1.6;
export const MIN_BOUNDARY_DELTA = 0.016;
export const MAX_BOUNDARY_DELTA = 0.05;

/** Default Yelp search radius for community sync (meters). */
export const DEFAULT_COMMUNITY_SYNC_RADIUS_M = 4000;

/** Extra geography buffer when expanding already-stored boundaries (meters). */
export const BOUNDARY_EXPAND_BUFFER_M = 1500;

export function effectiveDelta(delta: number): number {
  const widened = delta * BOUNDARY_WIDEN;
  const clamped = Math.min(
    MAX_BOUNDARY_DELTA,
    Math.max(MIN_BOUNDARY_DELTA, widened),
  );
  return Math.round(clamped * 1000) / 1000;
}
