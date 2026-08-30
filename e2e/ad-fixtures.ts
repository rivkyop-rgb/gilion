import { PDFDocument, StandardFonts } from "pdf-lib";
import sharp from "sharp";

/**
 * Test files, built in memory rather than committed.
 *
 * A repository is a bad place for an 8 MB binary that exists only to be
 * slightly larger than one limit and slightly smaller than another — and a
 * committed fixture drifts silently the moment a limit moves. Building them
 * here keeps the SIZE, which is the thing under test, visible in the code.
 */

export type Fixture = { name: string; mimeType: string; buffer: Buffer };

export async function validPdf(name = "ad.pdf"): Promise<Fixture> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Gilion test advertisement", { x: 60, y: 700, size: 24, font });
  const bytes = await doc.save();
  return { name, mimeType: "application/pdf", buffer: Buffer.from(bytes) };
}

export async function validJpg(name = "ad.jpg"): Promise<Fixture> {
  const buffer = await sharp({
    create: { width: 800, height: 600, channels: 3, background: "#1f5fbf" },
  })
    .jpeg()
    .toBuffer();
  return { name, mimeType: "image/jpeg", buffer };
}

export async function validPng(name = "ad.png"): Promise<Fixture> {
  const buffer = await sharp({
    create: { width: 800, height: 600, channels: 4, background: "#bf5f1f" },
  })
    .png()
    .toBuffer();
  return { name, mimeType: "image/png", buffer };
}

/**
 * A PNG of pseudo-random bytes stored uncompressed, so its byte count is close
 * to width x height x channels and can be aimed at a target size.
 *
 * Noise, not a flat colour: a solid image compresses to a few kilobytes no
 * matter how large its dimensions are, which would quietly turn the
 * size-limit specs into tests of nothing.
 */
export async function pngOfRoughly(megabytes: number, name: string): Promise<Fixture> {
  const pixels = Math.ceil((megabytes * 1024 * 1024) / 3);
  const side = Math.ceil(Math.sqrt(pixels));
  const raw = Buffer.allocUnsafe(side * side * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 977) % 256;

  const buffer = await sharp(raw, { raw: { width: side, height: side, channels: 3 } })
    .png({ compressionLevel: 0 })
    .toBuffer();
  return { name, mimeType: "image/png", buffer };
}

/** Right magic bytes, wrong everything after them — a genuinely broken PDF. */
export function corruptPdf(name = "broken.pdf"): Fixture {
  return {
    name,
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7 this file stops mid-sentence and has no xref table at all"),
  };
}

/** A real file of a type the system does not accept, named as though it were. */
export function gifNamedPdf(name = "actually-a-gif.pdf"): Fixture {
  return { name, mimeType: "application/pdf", buffer: Buffer.from("GIF89a     ;") };
}
