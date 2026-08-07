import { getSupabaseAdmin } from "./supabase";

export type PutPublicResult = {
  storageKey: string;
  publicUrl: string;
};

const DEFAULT_BUCKET = "hanchi-media";

export function mediaBucket(): string {
  return process.env.MEDIA_BUCKET?.trim() || DEFAULT_BUCKET;
}

export function mediaUploadsEnabled(): boolean {
  if (process.env.MEDIA_UPLOADS_ENABLED === "0") return false;
  // Same Supabase project as Auth — need URL + secret for storage ops.
  const url = process.env.SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return Boolean(url && key);
}

export function publicStorageKey(
  purpose: string,
  userId: string,
  mediaId: string,
  ext: string,
): string {
  return `${purpose}/${userId}/${mediaId}.${ext}`;
}

/**
 * Publish bytes to Supabase Storage as a public object (call only after moderation).
 * Create a public bucket named hanchi-media (or MEDIA_BUCKET) in the Supabase dashboard.
 */
export async function putPublicImage(input: {
  storageKey: string;
  bytes: Buffer;
  contentType: string;
}): Promise<PutPublicResult> {
  const supabase = getSupabaseAdmin();
  const bucket = mediaBucket();

  const { error } = await supabase.storage
    .from(bucket)
    .upload(input.storageKey, input.bytes, {
      contentType: input.contentType,
      upsert: true,
      cacheControl: "3600",
    });

  if (error) {
    throw new Error(error.message || "storage_upload_failed");
  }

  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(input.storageKey);

  if (!data?.publicUrl) {
    throw new Error("storage_public_url_failed");
  }

  return { storageKey: input.storageKey, publicUrl: data.publicUrl };
}

/** Extract storage object path from a Supabase public URL, if possible. */
function storagePathFromUrlOrKey(urlOrKey: string): string | null {
  const raw = urlOrKey.trim();
  if (!raw) return null;

  // Already a path like moment/userId/id.jpg
  if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
    return raw.replace(/^\//, "");
  }

  try {
    const u = new URL(raw);
    // …/storage/v1/object/public/<bucket>/<path>
    const marker = `/object/public/${mediaBucket()}/`;
    const idx = u.pathname.indexOf(marker);
    if (idx >= 0) {
      return decodeURIComponent(u.pathname.slice(idx + marker.length));
    }
    // Fallback: last path segments after bucket name
    const parts = u.pathname.split("/").filter(Boolean);
    const bucketIdx = parts.indexOf(mediaBucket());
    if (bucketIdx >= 0 && bucketIdx < parts.length - 1) {
      return parts.slice(bucketIdx + 1).map(decodeURIComponent).join("/");
    }
  } catch {
    return null;
  }
  return null;
}

export async function deleteStoredObject(urlOrKey: string): Promise<void> {
  if (!mediaUploadsEnabled() || !urlOrKey) return;
  const path = storagePathFromUrlOrKey(urlOrKey);
  if (!path) return;
  try {
    const supabase = getSupabaseAdmin();
    await supabase.storage.from(mediaBucket()).remove([path]);
  } catch {
    // Best-effort cleanup after reject or replace.
  }
}

export function maxMediaBytes(): number {
  const n = Number(process.env.MEDIA_MAX_BYTES ?? 5 * 1024 * 1024);
  return Number.isFinite(n) && n > 0 ? n : 5 * 1024 * 1024;
}
