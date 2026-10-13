/**
 * The mail that carries tear sheets to a customer (14/10/2026).
 * Pure module — no Prisma, no React (conventions.md §9).
 *
 * Links, not attachments: a mail link can open a compose window with text in
 * it but cannot attach a file, and a link per tear sheet lets one mail carry
 * as many as were chosen.
 */
export type TearSheetMailItem = { date: string; newspaperName: string; url: string };

/** `2026-10-14` → `14.10.2026`. */
const shown = (iso: string) => iso.split("-").reverse().join(".");

export function tearSheetMail(input: {
  businessName: string;
  customerName: string;
  items: TearSheetMailItem[];
  /** The customer's portal, where every tear sheet waits. Null → not mentioned. */
  portalUrl: string | null;
}): { subject: string; body: string } {
  const one = input.items.length === 1;
  const subject = one
    ? `הוכחת פרסום — ${input.items[0]!.newspaperName} ${shown(input.items[0]!.date)}`
    : `הוכחות פרסום — ${input.items.length} פרסומים`;
  const lines = [
    `שלום ${input.customerName},`,
    "",
    one
      ? "מצורף קישור לעמוד שבו פורסמה המודעה שלכם:"
      : "מצורפים קישורים לעמודים שבהם פורסמו המודעות שלכם:",
    "",
    ...input.items.map((i) => `${i.newspaperName} · ${shown(i.date)}\n${i.url}`),
    "",
    ...(input.portalUrl ? [`כל ההוכחות זמינות גם באזור האישי: ${input.portalUrl}`, ""] : []),
    "בברכה,",
    input.businessName,
  ];
  return { subject, body: lines.join("\n") };
}
