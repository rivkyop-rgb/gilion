/**
 * Reads behind /p/<slug> (backlog 21).
 *
 * Unscoped by necessity — nobody has signed in, so there is no tenant yet, and
 * the slug IS how the tenant is found. It returns only what a sign-in page may
 * show a stranger: the business's name and its branding.
 */
import { basePrisma } from "./db";
import { loadSettings } from "./business-settings";

export async function portalBusiness(slug: string) {
  const business = await basePrisma.business.findFirst({
    where: { slug, status: "active" },
    select: { id: true, name: true, slug: true },
  });
  if (!business) return null;
  const settings = await loadSettings(business.id);
  return { ...business, settings };
}

export async function businessSlug(businessId: string): Promise<string> {
  const row = await basePrisma.business.findUnique({
    where: { id: businessId },
    select: { slug: true },
  });
  return row?.slug ?? "";
}

export async function slugTaken(slug: string, exceptBusinessId: string): Promise<boolean> {
  const row = await basePrisma.business.findFirst({
    where: { slug, id: { not: exceptBusinessId } },
    select: { id: true },
  });
  return row !== null;
}

export async function setBusinessSlug(businessId: string, slug: string) {
  await basePrisma.business.update({ where: { id: businessId }, data: { slug } });
}
