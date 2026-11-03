/**
 * Everything a designer needs to lay out an issue OUTSIDE the system (the
 * user, 03/11/2026: "יש כאלו שלא משבצים במערכת — שיוכלו לקבל בצורה מסודרת
 * את כל הקבצים שצריך לשבץ + הערות לגבי מיקום").
 *
 * One list, used three ways: the ZIP's file names, the list inside it, and the
 * share page. Built from the issue's own publications — matched on (newspaper,
 * date) like the board — so it is right before anything has been placed, and
 * names the page for whatever already has been.
 */
import { createZip } from "@/lib/files/zip";
import { getObject } from "@/lib/storage/minio";
import { footprintMm, formatCm } from "@/lib/domain/grid";
import {
  describePosition,
  effectivePosition,
  positionOf,
  rankedPages,
} from "@/lib/domain/position-request";
import { PUBLICATION_STATUS_LABELS, type PublicationStatus } from "@/lib/domain/publication-status";
import { basePrisma } from "./db";
import { getIssue, gridOfIssue, publicationsForIssue } from "./issues";

export type PackageItem = {
  publicationId: string;
  /** Where it already sits, when it does. */
  pageNumber: number | null;
  customerName: string;
  shapeName: string;
  /** "13.0 × 20.0 ס״מ". */
  size: string;
  position: string | null;
  note: string | null;
  status: string;
  file: { key: string; name: string; fileType: string; previewUrl: string | null } | null;
  /** The name inside the ZIP — page first, so a folder sorts like the paper. */
  zipName: string | null;
};

export type LayoutPackage = {
  issueId: string;
  newspaperName: string;
  date: Date;
  totalPages: number;
  items: PackageItem[];
};

const DAY = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeZone: "Asia/Jerusalem" });

export async function layoutPackage(
  businessId: string,
  issueId: string,
): Promise<LayoutPackage | null> {
  const issue = await getIssue(businessId, issueId);
  if (!issue) return null;
  const publications = await publicationsForIssue(businessId, issue.newspaper_id, issue.issue_date);
  const grid = gridOfIssue(issue);

  const pageOf = new Map<string, number>();
  for (const placement of issue.placements) {
    const page = issue.pages.find((p) => p.id === placement.issue_page_id);
    if (page) pageOf.set(placement.publication_id, page.page_number);
  }

  const taken = new Set<string>();
  const items: PackageItem[] = publications.map((pub) => {
    const req = effectivePosition(
      pub.order_item ? positionOf(pub.order_item) : null,
      pub.customer.preferred_page,
    );
    const pageNumber = pageOf.get(pub.id) ?? null;
    const mm = grid ? footprintMm(pub.ad_shape, grid) : null;
    const file = pub.advertisement
      ? {
          key: pub.advertisement.file_url,
          name: pub.advertisement.name,
          fileType: pub.advertisement.file_type,
          previewUrl: pub.advertisement.preview_url,
        }
      : null;
    let zipName: string | null = null;
    if (file) {
      const ext = file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? `.${file.fileType}`;
      const wanted = rankedPages(req, issue.pages.length)[0];
      const where = pageNumber
        ? `עמוד ${String(pageNumber).padStart(2, "0")}`
        : wanted
          ? `מבוקש ${String(wanted).padStart(2, "0")}`
          : "ללא עמוד";
      const base = safe(`${where} - ${pub.customer.business_name} - ${pub.ad_shape.name}`);
      let name = `${base}${ext}`;
      for (let n = 2; taken.has(name); n++) name = `${base} (${n})${ext}`;
      taken.add(name);
      zipName = name;
    }
    return {
      publicationId: pub.id,
      pageNumber,
      customerName: pub.customer.business_name,
      shapeName: pub.ad_shape.name,
      size: mm ? `${formatCm(mm.widthMm)} × ${formatCm(mm.heightMm)} ס״מ` : "",
      position: describePosition(req),
      note: req.note,
      status: PUBLICATION_STATUS_LABELS[pub.status as PublicationStatus] ?? pub.status,
      file,
      zipName,
    };
  });

  items.sort(
    (a, b) =>
      (a.pageNumber ?? 999) - (b.pageNumber ?? 999) || a.customerName.localeCompare(b.customerName, "he"),
  );

  return {
    issueId: issue.id,
    newspaperName: issue.newspaper.name,
    date: issue.issue_date,
    totalPages: issue.pages.length,
    items,
  };
}

/** The ZIP: every file, plus "רשימה.csv" with the page, size, request and note. */
export async function layoutPackageZip(pkg: LayoutPackage): Promise<Buffer> {
  // One file that cannot be read must not cost the designer the other forty:
  // it is left out and the list says so, rather than the whole ZIP failing.
  const missing = new Set<string>();
  const files = (
    await Promise.all(
      pkg.items
        .filter((i) => i.file && i.zipName)
        .map(async (i) => {
          try {
            return { name: i.zipName!, data: new Uint8Array(await getObject(i.file!.key)) };
          } catch (error) {
            console.warn("layout package: file unreadable", i.file!.key, error);
            missing.add(i.publicationId);
            return null;
          }
        }),
    )
  ).filter((f) => f !== null);
  const headers = ["עמוד", "לקוח", "צורה", "גודל", "מיקום מבוקש", "הערה למשבץ", "קובץ", "מצב"];
  const rows = pkg.items.map((i) => [
    i.pageNumber ?? "",
    i.customerName,
    i.shapeName,
    i.size,
    i.position ?? "",
    i.note ?? "",
    !i.zipName ? "חסר קובץ" : missing.has(i.publicationId) ? "הקובץ לא נמצא באחסון" : i.zipName,
    i.status,
  ]);
  const csv =
    "\uFEFF" + [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  return createZip([{ name: "רשימה.csv", data: new TextEncoder().encode(csv) }, ...files]);
}

export function packageFileName(pkg: LayoutPackage): string {
  return safe(`${pkg.newspaperName} ${DAY.format(pkg.date).replace(/\//g, "-")}`) + ".zip";
}

/** The issue a package belongs to, by id alone — for the signed public link. */
export async function businessOfIssue(issueId: string): Promise<string | null> {
  const issue = await basePrisma.issue.findUnique({
    where: { id: issueId },
    select: { business_id: true },
  });
  return issue?.business_id ?? null;
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Characters no file system takes, and nothing that could climb a folder. */
function safe(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\.+$/, "").trim().slice(0, 120);
}
