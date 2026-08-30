/**
 * The private object store (conventions.md §5, FR-15).
 *
 * One bucket, private, and no URL of it ever leaves the server. Everything a
 * browser sees is a five-minute presigned link minted by
 * app/api/files/[...key]/route.ts after it has checked the tenant.
 */
import { Client } from "minio";

/** Presigned links live five minutes — long enough to fetch, short enough to
 * be useless if it leaks into a log or a chat window (conventions.md §5). */
export const PRESIGNED_TTL_SECONDS = 300;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — see .env.example`);
  return value;
}

let cached: Client | null = null;

export function storage(): Client {
  if (cached) return cached;
  cached = new Client({
    endPoint: required("MINIO_ENDPOINT"),
    port: Number(process.env.MINIO_PORT ?? 9000),
    useSSL: process.env.MINIO_USE_SSL === "true",
    accessKey: required("MINIO_ACCESS_KEY"),
    secretKey: required("MINIO_SECRET_KEY"),
  });
  return cached;
}

export function bucket(): string {
  return required("MINIO_BUCKET");
}

/**
 * Creates the bucket on first use.
 *
 * Deliberately lazy rather than a startup step: the app must come up and show
 * a readable error on the upload screen when MinIO is down, not fail to boot.
 */
export async function ensureBucket(): Promise<void> {
  const client = storage();
  const name = bucket();
  if (!(await client.bucketExists(name))) await client.makeBucket(name);
}

/**
 * The key layout from conventions.md §5.
 *
 * businessId comes FIRST on purpose: the download route compares that first
 * segment with the session's business before it signs anything, so a key from
 * another tenant is refused by shape and not only by lookup.
 */
export function adKey(
  businessId: string,
  adId: string,
  file: "original" | "current" | "previous" | "preview",
  ext: string,
): string {
  return `${businessId}/ads/${adId}/${file}.${ext}`;
}

/**
 * A replacement needs a key that collides with nothing the ad already holds.
 *
 * The revision is a timestamp rather than a counter, and that is the point: a
 * counter derived from "does a previous version exist?" repeats from the third
 * replacement onwards, and the repeat lands on the key that IS the live file —
 * so the new bytes overwrite it and `previous_file_url` ends up pointing at the
 * same object as `file_url`. The previous version is then gone and restoring it
 * does nothing. Storage does not grow: every replacement deletes the version
 * that falls off the end (orphanedByReplace).
 */
export function adRevisionKey(businessId: string, adId: string, ext: string): string {
  return `${businessId}/ads/${adId}/current-${Date.now()}.${ext}`;
}

/** The business a key belongs to, or null if it is not a well-formed key. */
export function businessOfKey(key: string): string | null {
  const [businessId, ...rest] = key.split("/");
  return businessId && rest.length > 0 ? businessId : null;
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await ensureBucket();
  await storage().putObject(bucket(), key, body, body.length, {
    "Content-Type": contentType,
  });
}

export async function getObject(key: string): Promise<Buffer> {
  const stream = await storage().getObject(bucket(), key);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/** Best-effort: an object that is already gone is not an error worth raising. */
export async function removeObject(key: string): Promise<void> {
  try {
    await storage().removeObject(bucket(), key);
  } catch {
    /* already gone */
  }
}

export async function presignedGetUrl(key: string, fileName?: string): Promise<string> {
  return storage().presignedGetObject(
    bucket(),
    key,
    PRESIGNED_TTL_SECONDS,
    fileName
      ? {
          // RFC 5987, so a Hebrew file name survives the round trip.
          "response-content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        }
      : undefined,
  );
}

export const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  png: "image/png",
};
