/**
 * An Israeli phone number as people write it (08/11/2026): "03-5551234",
 * "052-1234567". Stored digits-only (normalizePhone) so search and WhatsApp
 * work; shown with the dash so it can be read aloud. Anything that is not a
 * plain local number — an international one, an extension — is shown as stored.
 * Pure module (conventions.md §9).
 */
export function displayPhone(stored: string): string {
  const digits = stored.replace(/\D/g, "");
  if (digits !== stored.trim()) return stored;
  // Mobile and the 07x prefixes: three-digit area code.
  if (/^0(5\d|7\d)\d{7}$/.test(digits)) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  // Landline: two-digit area code.
  if (/^0[2-489]\d{7}$/.test(digits)) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return stored;
}
