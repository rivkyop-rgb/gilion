"use server";

import { z } from "zod";

import { canReadArea, canWriteArea, getTenantContext } from "@/lib/auth/tenant";
import { searchForPalette } from "@/lib/data/command-search";

/**
 * What the quick-search window (Ctrl+K) finds for what was typed
 * (redesign, 29/09/2026).
 *
 * Every result is filtered by the same area rules as the screens it opens: a
 * role that cannot read orders is not handed an order number here, and one
 * that cannot write billing is not offered "רישום תשלום" (FR-8). The client
 * decides nothing about permissions — it renders what comes back.
 */
export type PaletteResults = {
  customers: {
    id: string;
    name: string;
    mayOrder: boolean;
    mayPay: boolean;
  }[];
  orders: { id: string; number: number; customerName: string }[];
};

const querySchema = z.string().trim().min(1).max(100);

export async function paletteSearchAction(raw: string): Promise<PaletteResults> {
  const ctx = await getTenantContext();
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) return { customers: [], orders: [] };

  const mayCustomers = canReadArea(ctx, "customers");
  const mayOrders = canReadArea(ctx, "orders");
  const found = await searchForPalette(ctx.businessId, parsed.data, {
    customers: mayCustomers,
    orders: mayOrders,
  });

  const mayOrder = canWriteArea(ctx, "orders");
  const mayPay = canWriteArea(ctx, "billing");
  return {
    customers: found.customers.map((c) => ({ ...c, mayOrder, mayPay })),
    orders: found.orders,
  };
}
