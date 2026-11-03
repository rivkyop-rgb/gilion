"use server";

import { revalidatePath } from "next/cache";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { recordAction } from "@/lib/data/audit";
import * as data from "@/lib/data/customers";
import { parseCustomerRows, type ImportRow } from "@/lib/domain/customer-import";
import { contactsToStorage, toStorage, validateCustomer } from "@/lib/domain/customer";
import { readSheet } from "@/lib/files/sheet";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 2000;

export type PreviewRow = ImportRow & { duplicates: string[] };
export type PreviewState = {
  message?: string;
  fileName?: string;
  hadHeader?: boolean;
  rows?: PreviewRow[];
};

/**
 * Step 1 (03/11/2026): read the file and say, row by row, what would happen —
 * nothing is written. Duplicates against existing customers are named here,
 * the same warning the form gives.
 */
export async function previewCustomerImportAction(
  _prev: PreviewState,
  formData: FormData,
): Promise<PreviewState> {
  const ctx = await getTenantContext();
  requireArea(ctx, "customers", "write");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { message: "לא נבחר קובץ" };
  if (file.size > MAX_BYTES) return { message: "הקובץ גדול מדי — עד 5MB" };

  let sheet: string[][];
  try {
    sheet = readSheet(file.name, new Uint8Array(await file.arrayBuffer()));
  } catch {
    return { message: "לא הצלחנו לקרוא את הקובץ. יש לשמור אותו כ־Excel (xlsx) או כ־CSV" };
  }
  if (sheet.length === 0) return { message: "הקובץ ריק" };
  if (sheet.length > MAX_ROWS + 1) return { message: `עד ${MAX_ROWS} שורות בקובץ אחד` };

  const parsed = parseCustomerRows(sheet);
  const rows: PreviewRow[] = [];
  const seen = new Map<string, number>();
  for (const row of parsed.rows) {
    const stored = toStorage(row.input);
    const hits = row.errors.length
      ? []
      : await data.findContactDuplicates(ctx.businessId, {
          taxId: stored.tax_id,
          phones: [stored.phone].filter((v): v is string => !!v),
          emails: [stored.email].filter((v): v is string => !!v),
        });
    const duplicates = [...new Set(hits.map((h) => `כבר קיים אצל "${h.customerName}"`))];
    // The same business twice in the file is a duplicate too.
    const key = stored.tax_id ?? stored.business_name.toLowerCase();
    if (seen.has(key)) duplicates.push(`מופיע גם בשורה ${seen.get(key)} בקובץ`);
    else seen.set(key, row.line);
    rows.push({ ...row, duplicates });
  }
  return { fileName: file.name, hadHeader: parsed.hadHeader, rows };
}

export type ImportResult = { message?: string; created?: number; skipped?: number };

/**
 * Step 2: create what was previewed. Rows are re-validated here — the screen
 * is never trusted — and duplicates are created only when the user ticked
 * them, the same one-click "yes, both" the form offers.
 */
export async function runCustomerImportAction(
  rows: ImportRow[],
  includeLines: number[],
): Promise<ImportResult> {
  const ctx = await getTenantContext();
  requireArea(ctx, "customers", "write");
  if (!Array.isArray(rows) || rows.length > MAX_ROWS) return { message: "הבקשה לא תקינה" };
  const wanted = new Set(includeLines);

  let created = 0;
  let skipped = 0;
  for (const row of rows) {
    if (!wanted.has(row.line)) {
      skipped++;
      continue;
    }
    if (validateCustomer(row.input).length > 0) {
      skipped++;
      continue;
    }
    const customer = await data.createCustomer(
      ctx.businessId,
      toStorage(row.input),
      contactsToStorage(row.input.contacts),
    );
    await recordAction(
      ctx,
      { action: "create_customer", targetType: "Customer", targetId: customer.id },
      { source: "import" },
    );
    created++;
  }
  revalidatePath("/customers");
  return { created, skipped };
}
