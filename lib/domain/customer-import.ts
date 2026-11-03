/**
 * Rows of a spreadsheet → customers (the user, 03/11/2026: "אפשרות העלאת
 * לקוחות מאקסל"). Pure module — no Prisma, no React (conventions.md §9).
 *
 * The header row is matched by name, in Hebrew or English, in any order, so a
 * list exported from any other system imports without being rearranged. A
 * sheet with no recognisable header is read in the order the template uses.
 * Every row is validated by the same rules as the customer form.
 */
import { validateCustomer, type CustomerInput } from "./customer";

export const IMPORT_FIELDS = [
  "businessName",
  "taxId",
  "phone",
  "email",
  "contactName",
  "contactPhone",
  "contactEmail",
  "notes",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  businessName: "שם העסק",
  taxId: "ח.פ / ע.מ",
  phone: "טלפון",
  email: "מייל",
  contactName: "איש קשר",
  contactPhone: "טלפון איש קשר",
  contactEmail: "מייל איש קשר",
  notes: "הערות",
};

const ALIASES: Record<ImportField, string[]> = {
  businessName: ["שם העסק", "שם עסק", "שם הלקוח", "שם לקוח", "לקוח", "שם", "עסק", "חברה", "business", "company", "name", "customer"],
  taxId: ["ח.פ", "חפ", "ח״פ", "ח\"פ", "ע.מ", "עמ", "עוסק מורשה", "מספר עוסק", "ח.פ / ע.מ", "tax id", "vat", "tax"],
  phone: ["טלפון", "טלפון העסק", "טל", "טל.", "phone", "tel", "telephone"],
  email: ["מייל", "מייל העסק", "דוא״ל", "דואל", "דוא\"ל", "אימייל", "email", "e-mail", "mail"],
  contactName: ["איש קשר", "שם איש קשר", "איש הקשר", "contact", "contact name"],
  contactPhone: ["טלפון איש קשר", "נייד", "נייד איש קשר", "contact phone", "mobile"],
  contactEmail: ["מייל איש קשר", "contact email"],
  notes: ["הערות", "הערה", "notes", "comments"],
};

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_\-:]+/g, " ").replace(/[׳']/g, "");

/** Which column holds which field; null when the first row is not a header. */
export function mapHeader(row: string[]): Partial<Record<ImportField, number>> | null {
  const map: Partial<Record<ImportField, number>> = {};
  row.forEach((cell, index) => {
    const key = norm(cell);
    if (!key) return;
    for (const field of IMPORT_FIELDS) {
      if (map[field] !== undefined) continue;
      if (ALIASES[field].some((a) => norm(a) === key)) {
        map[field] = index;
        return;
      }
    }
  });
  return map.businessName !== undefined ? map : null;
}

export type ImportRow = {
  /** The spreadsheet's own row number, as Excel shows it. */
  line: number;
  input: CustomerInput;
  errors: string[];
};

export function parseCustomerRows(rows: string[][]): {
  header: Partial<Record<ImportField, number>>;
  hadHeader: boolean;
  rows: ImportRow[];
} {
  const found = rows.length > 0 ? mapHeader(rows[0]!) : null;
  const header = found ?? Object.fromEntries(IMPORT_FIELDS.map((f, i) => [f, i]));
  const body = found ? rows.slice(1) : rows;
  const first = found ? 2 : 1;

  return {
    header,
    hadHeader: Boolean(found),
    rows: body.map((cells, i) => {
      const get = (field: ImportField) => {
        const at = header[field];
        const value = at === undefined ? "" : (cells[at] ?? "").trim();
        // Excel stores 050-1234567 typed as a number and drops the 0.
        if ((field === "phone" || field === "contactPhone") && /^[1-9]\d{7,8}$/.test(value)) {
          return `0${value}`;
        }
        return value;
      };
      const contactName = get("contactName");
      const contactPhone = get("contactPhone");
      const contactEmail = get("contactEmail");
      // An exported list often keeps the only phone on the contact. The form
      // requires one on the business, so the contact's is lifted up to it
      // rather than refusing a row a person could plainly be reached on.
      const lift = !get("phone") && !get("email");
      const input: CustomerInput = {
        businessName: get("businessName"),
        taxId: get("taxId") || null,
        phone: get("phone") || (lift ? contactPhone : "") || null,
        email: get("email") || (lift ? contactEmail : "") || null,
        notes: get("notes") || null,
        contacts: contactName
          ? [
              {
                name: contactName,
                phone: contactPhone || null,
                email: contactEmail || null,
                receivesReminders: true,
                receivesTearSheets: true,
              },
            ]
          : [],
      };
      const errors = validateCustomer(input).map((e) => e.message);
      return { line: first + i, input, errors };
    }),
  };
}

/** The template a user downloads: the header row and one example. */
export const TEMPLATE_ROWS: string[][] = [
  IMPORT_FIELDS.map((f) => IMPORT_FIELD_LABELS[f]),
  ["דוגמה בע״מ", "512345678", "03-1234567", "office@example.co.il", "דנה כהן", "050-1234567", "dana@example.co.il", ""],
];
