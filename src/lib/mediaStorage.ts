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

let ensuredBuckets = new Set<string>();

/**
 * Ensure the media bucket exists and is public (idempotent, best-effort).
 * Prefer creating `hanchi-media` once in the Supabase dashboard if this fails.
 */
async function ensurePublicBucket(bucket: string): Promise<void> {
  if (ensuredBuckets.has(bucket)) return;
  const supabase = getSupabaseAdmin();

  const { data: existing, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) {
    console.error("[mediaStorage] listBuckets:", listErr.message);
    // Still try upload; may already exist.
    return;
  }

  const found = existing?.find((b) => b.name === bucket);
  if (!found) {
    const { error: createErr } = await supabase.storage.createBucket(bucket, {
      public: true,
      fileSizeLimit: "10MB",
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    });
    if (createErr) {
      // Race: created elsewhere is fine; missing permission needs dashboard.
      console.error("[mediaStorage] createBucket:", createErr.message);
      return;
    }
    console.log(`[mediaStorage] created public bucket ${bucket}`);
  } else if (!found.public) {
    const { error: updateErr } = await supabase.storage.updateBucket(bucket, {
      public: true,
    });
    if (updateErr) {
      console.error("[mediaStorage] updateBucket public:", updateErr.message);
    }
  }

  ensuredBuckets.add(bucket);
}

/**
 * Publish bytes to Supabase Storage as a public object (call only after moderation).
 * Create a public bucket named hanchi-media (or MEDIA_BUCKET) in the Supabase dashboard if ensure fails.
 */
export async function putPublicImage(input: {
  storageKey: string;
  bytes: Buffer;
  contentType: string;
}): Promise<PutPublicResult> {
  const supabase = getSupabaseAdmin();
  const bucket = mediaBucket();

  await ensurePublicBucket(bucket);

  // Uint8Array avoids flaky Node Buffer → fetch body conversion in supabase-js.
  const body = new Uint8Array(input.bytes);

  const { error } = await supabase.storage.from(bucket).upload(input.storageKey, body, {
    contentType: input.contentType,
    upsert: true,
    cacheControl: "3600",
  });

  if (error) {
    console.error("[mediaStorage] upload:", error.message, {
      bucket,
      path: input.storageKey,
      bytes: input.bytes.length,
      contentType: input.contentType,
    });
    throw new Error(error.message || "storage_upload_failed");
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(input.storageKey);

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
