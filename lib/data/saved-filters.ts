import { tenantDb } from "./db";
import type { SavedFilterList } from "@/lib/domain/saved-filter";

/** The buttons one person sees on a list: everyone's, then their own. */
export async function listSavedFilters(businessId: string, userId: string, list: SavedFilterList) {
  return tenantDb(businessId).savedFilter.findMany({
    where: { list, OR: [{ owner_id: null }, { owner_id: userId }] },
    orderBy: [{ owner_id: { sort: "asc", nulls: "first" } }, { created_at: "asc" }],
    select: { id: true, name: true, color: true, query: true, owner_id: true, created_by: true },
  });
}

export async function createSavedFilter(
  businessId: string,
  input: {
    list: SavedFilterList;
    name: string;
    color: string;
    query: string;
    ownerId: string | null;
    createdBy: string;
  },
) {
  return tenantDb(businessId).savedFilter.create({
    data: {
      business_id: businessId,
      list: input.list,
      name: input.name,
      color: input.color,
      query: input.query,
      owner_id: input.ownerId,
      created_by: input.createdBy,
    },
    select: { id: true },
  });
}

export async function getSavedFilter(businessId: string, id: string) {
  return tenantDb(businessId).savedFilter.findUnique({
    where: { id },
    select: { id: true, owner_id: true, created_by: true, list: true },
  });
}

export async function deleteSavedFilter(businessId: string, id: string) {
  await tenantDb(businessId).savedFilter.deleteMany({ where: { id } });
}
