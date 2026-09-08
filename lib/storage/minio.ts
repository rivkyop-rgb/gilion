/**
 * The private object store (conventions.md §5, FR-15).
 *
 * One bucket, private, and no URL of it ever leaves the server. A browser only
 * ever talks to app/api/files/[...key]/route.ts, which checks the tenant and
 * then STREAMS the bytes back — see `getObjectStream` for why it streams
 * rather than redirecting to a presigned link.
 */
import type { Readable } from "node:stream";
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
 * The one PDF an issue keeps (conventions.md §5, FR-22).
 *
 * A fixed name and not a versioned one, deliberately: the MVP stores only the
 * LATEST final PDF, so a re-close must land on the same object and replace it.
 * The history that does accumulate is PdfGenerationLog, which records who
 * produced what and when — the file is the current truth, the log is the story.
 */
export function issuePdfKey(businessId: string, issueId: string): string {
  return `${businessId}/issues/${issueId}/final.pdf`;
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

/**
 * The object's bytes, for the route handler to pass straight through.
 *
 * ── Why the bytes and not a presigned link ───────────────────────────────────
 * A presigned URL names the host the SERVER knows MinIO by. With MinIO on the
 * same machine that is `localhost:9100` — and the browser then resolves
 * `localhost` to the machine the PERSON is sitting at, which is not running
 * MinIO. The request fails, and it fails silently: `<img>` has no error to
 * show, so every preview in the product is an empty box for everyone except
 * whoever is sitting at the server. Nothing in a log says why.
 *
 * Streaming removes the whole class of problem: the browser only ever contacts
 * an origin it has demonstrably reached already, and the object store does not
 * have to be routable from outside at all — which is how it should be deployed
 * anyway. conventions.md §5 describes the redirect; what §5 is actually FOR is
 * that no object URL is ever exposed, and that is stronger here, not weaker.
 *
 * The cost is that file bytes pass through Node. At the size of a newspaper
 * office — previews are a few KB and the ceiling on an ad is `max_ad_file_size`
 * — that is not a trade worth a broken image.
 */
export async function getObjectStream(key: string): Promise<Readable> {
  return storage().getObject(bucket(), key);
}

/** Size and type, so the response can declare them. Null when it is gone. */
export async function statObject(key: string): Promise<{ size: number } | null> {
  try {
    const stat = await storage().statObject(bucket(), key);
    return { size: stat.size };
  } catch {
    return null;
  }
}

/**
 * Still here, and still five minutes, for anything that must hand a URL to
 * something that is NOT this browser session — nothing does today.
 */
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
  jpeg: "image/jpeg",
  png: "image/png",
  // Brand assets (stage 11). SVG is served with its real type on purpose: an
  // <img src> does not execute script inside it, and the bytes have already
  // been through lib/domain/svg-sanitize.ts before they were ever stored.
  svg: "image/svg+xml",
  webp: "image/webp",
  ico: "image/x-icon",
};

/** The type an object key implies, from its extension. */
export function contentTypeOfKey(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}
