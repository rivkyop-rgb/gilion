/**
 * Which models are scoped to a business, and how (conventions.md §2).
 *
 * This file is data, not logic, so that the extension in db.ts and the tests
 * both read the same list. A model missing from here is silently unscoped —
 * that is the failure mode this project cares most about, so every new model
 * must be classified here in the same commit that adds it.
 */

/** Models that carry business_id directly. */
export const DIRECT_TENANT_MODELS = [
  "Customer",
  "Newspaper",
  "AdOrder",
  "Publication",
  "Advertisement",
  "Issue",
  "Payment",
  "AuditLog",
  "UserMembership",
] as const;

/**
 * Models reached through a parent that holds business_id. The value is the
 * relation path from the model to that parent. Fetching one of these by id
 * alone is forbidden — the extension nests the scope through the relation.
 */
export const INDIRECT_TENANT_MODELS: Record<string, string> = {
  PageType: "newspaper",
  AllowedAdShape: "page_type",
  PriceRule: "newspaper",
  LayoutTemplate: "newspaper",
  TemplatePage: "layout_template",
  TemplateSlot: "template_page",
  AdOrderItem: "ad_order",
  IssuePage: "issue",
  Placement: "issue",
  Reminder: "publication",
  PdfGenerationLog: "issue",
};

/**
 * The single documented exception: ad shapes are shared across all businesses
 * and have no business_id in the ERD.
 */
export const GLOBAL_MODELS = ["AdShape"] as const;

/** Models with no tenant dimension at all — auth-level entities. */
export const UNSCOPED_MODELS = ["Business", "User"] as const;

export function isDirectTenantModel(model: string): boolean {
  return (DIRECT_TENANT_MODELS as readonly string[]).includes(model);
}

export function isIndirectTenantModel(model: string): boolean {
  return Object.hasOwn(INDIRECT_TENANT_MODELS, model);
}
