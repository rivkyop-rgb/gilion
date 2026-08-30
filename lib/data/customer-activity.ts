/**
 * Everything the customer card shows about one customer (US-002, US-010).
 *
 * Deliberately its own module rather than more functions on customers.ts: this
 * reads across orders, publications and advertisements, and keeping the
 * customer CRUD free of those joins is what keeps the delete guard and the
 * validation easy to read.
 */
import { tenantDb } from "./db";

export async function customerOrders(businessId: string, customerId: string) {
  return tenantDb(businessId).adOrder.findMany({
    where: { customer_id: customerId },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      status: true,
      source: true,
      total_price: true,
      payment_status: true,
      external_invoice_number: true,
      created_at: true,
      approved_at: true,
      _count: { select: { publications: true } },
    },
    take: 100,
  });
}

export async function customerPublications(businessId: string, customerId: string) {
  return tenantDb(businessId).publication.findMany({
    where: { customer_id: customerId },
    orderBy: { publication_date: "desc" },
    select: {
      id: true,
      publication_date: true,
      status: true,
      price: true,
      payment_status: true,
      advertisement_id: true,
      newspaper: { select: { name: true } },
      ad_shape: { select: { name: true } },
    },
    take: 100,
  });
}

export async function customerAdvertisements(businessId: string, customerId: string) {
  return tenantDb(businessId).advertisement.findMany({
    where: { customer_id: customerId },
    orderBy: { uploaded_at: "desc" },
    select: {
      id: true,
      name: true,
      file_type: true,
      file_size: true,
      preview_url: true,
      status: true,
      validation_status: true,
      uploaded_at: true,
      _count: { select: { publications: true } },
    },
    take: 100,
  });
}
