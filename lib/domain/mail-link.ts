/**
 * Where an email link goes (Business.mail_client, admin panel).
 *
 * Pure: the same answer on the server and in the browser, and testable
 * without either.
 */
export type MailClient = "gmail" | "mailto";

export const MAIL_CLIENT_LABELS: Record<MailClient, string> = {
  gmail: "Gmail",
  mailto: "תוכנת המייל במחשב",
};

/** mailto with the subject and body already written. */
export function mailtoHref(email: string, subject?: string, body?: string): string {
  const q = new URLSearchParams();
  if (subject) q.set("subject", subject);
  if (body) q.set("body", body);
  // URLSearchParams writes spaces as "+", which mail programs show literally.
  const query = q.toString().replace(/\+/g, "%20");
  return query ? `mailto:${email}?${query}` : `mailto:${email}`;
}

/**
 * Gmail's compose window, addressed and written. `view=cm&fs=1` is the
 * full-screen compose URL Gmail documents for "mailto"-style links; it opens
 * in whichever Google account the browser is signed in to.
 */
export function gmailHref(email: string, subject?: string, body?: string): string {
  const q = new URLSearchParams({ view: "cm", fs: "1", to: email });
  if (subject) q.set("su", subject);
  if (body) q.set("body", body);
  // "%20", not URLSearchParams' "+": a "+" can reach the body literally.
  return `https://mail.google.com/mail/?${q.toString().replace(/\+/g, "%20")}`;
}

export function emailHref(
  client: MailClient,
  email: string,
  subject?: string,
  body?: string,
): string {
  return client === "gmail" ? gmailHref(email, subject, body) : mailtoHref(email, subject, body);
}
