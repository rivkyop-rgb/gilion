import "dotenv/config";
import bcrypt from "bcryptjs";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { materializeBaseShapes } from "../lib/domain/base-shapes";
import { deriveGrid } from "../lib/domain/grid";

/**
 * Development seed. The MVP has no user-management UI (stage 01 scope), so
 * memberships are created here.
 *
 * Two businesses on purpose: tenant isolation cannot be tested with one.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const PASSWORD = "gilion1234";

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 10);

  const alpha = await prisma.business.upsert({
    where: { id: "biz_alpha" },
    update: { name: "עיתון השבוע" },
    create: { id: "biz_alpha", name: "עיתון השבוע" },
  });
  const beta = await prisma.business.upsert({
    where: { id: "biz_beta" },
    update: { name: "מקומון הצפון" },
    create: { id: "biz_beta", name: "מקומון הצפון" },
  });

  const people = [
    // admin belongs to BOTH businesses -> exercises the business picker (FR-2)
    {
      id: "usr_admin",
      name: "רבקי מנהלת",
      email: "admin@gilion.test",
      role: "admin" as const,
      businesses: [alpha.id, beta.id],
    },
    {
      id: "usr_sales",
      name: "נועה מכירות",
      email: "sales@gilion.test",
      role: "sales" as const,
      businesses: [alpha.id],
    },
    {
      id: "usr_designer",
      name: "טל גרפיקה",
      email: "designer@gilion.test",
      role: "designer" as const,
      businesses: [alpha.id],
    },
    {
      id: "usr_accounting",
      name: "מירי הנהלת חשבונות",
      email: "accounting@gilion.test",
      role: "accounting" as const,
      businesses: [alpha.id],
    },
    // single-business user in the OTHER tenant -> the isolation test's target
    {
      id: "usr_beta_admin",
      name: "דנה צפון",
      email: "beta@gilion.test",
      role: "admin" as const,
      businesses: [beta.id],
    },
  ];

  for (const p of people) {
    await prisma.user.upsert({
      where: { id: p.id },
      update: { name: p.name, email: p.email, password_hash: hash, user_type: "internal" },
      create: {
        id: p.id,
        name: p.name,
        email: p.email,
        password_hash: hash,
        user_type: "internal",
      },
    });
    for (const businessId of p.businesses) {
      await prisma.userMembership.upsert({
        where: { user_id_business_id: { user_id: p.id, business_id: businessId } },
        update: { role: p.role, status: "active" },
        create: { user_id: p.id, business_id: businessId, role: p.role, status: "active" },
      });
    }
  }

  // A customer-portal user. It has no membership yet: Customer does not exist
  // until stage 02, and the CHECK constraint requires customer_id for this role.
  // It is here so customer-blocked.spec.ts has a real user_type=customer login.
  await prisma.user.upsert({
    where: { id: "usr_customer" },
    update: {
      name: "לקוח לדוגמה",
      email: "customer@gilion.test",
      password_hash: hash,
      user_type: "customer",
    },
    create: {
      id: "usr_customer",
      name: "לקוח לדוגמה",
      email: "customer@gilion.test",
      password_hash: hash,
      user_type: "customer",
    },
  });

  // Customers in BOTH businesses — tenant isolation cannot be tested with one.
  const customers = [
    {
      id: "cust_alpha_1",
      business_id: alpha.id,
      customer_type: "regular" as const,
      business_name: "מרכז הרפואה",
      contact_name: "יעל אבידן",
      phone: "0521234567",
      email: "yael@refua.test",
    },
    {
      id: "cust_alpha_2",
      business_id: alpha.id,
      customer_type: "casual" as const,
      business_name: null,
      contact_name: "משה לוי",
      phone: "0539876543",
      email: null,
    },
    {
      id: "cust_alpha_3",
      business_id: alpha.id,
      customer_type: "regular" as const,
      business_name: "אולמי הדר",
      contact_name: "דוד הדר",
      phone: null,
      email: "david@hadar.test",
    },
    {
      id: "cust_beta_1",
      business_id: beta.id,
      customer_type: "regular" as const,
      business_name: "צפון תיירות",
      contact_name: "רונית שפירא",
      phone: "0501112222",
      email: "ronit@tzafon.test",
    },
  ];

  for (const c of customers) {
    await prisma.customer.upsert({ where: { id: c.id }, update: c, create: c });
  }

  // The page grid. Chosen so the derived numbers come out round:
  //   Tabloid 279x432, margin 10, 6 columns, 12.5mm rows, 4mm gutter
  //   -> column width (279 - 20 - 7*4) / 6 = 38.5mm
  //   -> rows floor((432 - 20 - 4) / 16.5) = 24
  // A 1 cm module in BOTH directions, so every whole-centimetre size a person
  // can think of actually exists: 10x13 cm is a shape, not a number that gets
  // snapped to something else. The 9.5 mm margin is what makes the usable width
  // land on exactly 260 mm, which divides into 26 columns of 10 mm.
  // Tabloid 279x432 -> 26 x 41 cells of 1 cm.
  const GRID_SETTINGS = {
    page_size: "Tabloid",
    margin: 9.5,
    columns: 26,
    row_height_mm: 10,
    gutter_mm: 0,
  };

  // One configured newspaper per business, so stage 03 screens have something
  // real to show and tenant isolation stays testable.
  const papers = [
    { id: "paper_alpha", business_id: alpha.id, name: "עיתון השבוע" },
    { id: "paper_beta", business_id: beta.id, name: "מקומון הצפון" },
  ];
  for (const p of papers) {
    await prisma.newspaper.upsert({
      where: { id: p.id },
      update: { name: p.name, ...GRID_SETTINGS },
      create: {
        ...p,
        ...GRID_SETTINGS,
        print_quality: "דפוס אופסט רגיל",
        max_ad_file_size: 10 * 1024 * 1024,
      },
    });
  }

  // The shape catalogue belongs to the newspaper (conventions.md §2). Each
  // newspaper gets its own copy of the base set, resolved against its grid.
  //
  // Alpha keeps the historical ids — the e2e specs address cells by
  // `cell-{pageTypeId}-{shapeId}`, and preserving them keeps those green.
  const grid = deriveGrid({
    pageSize: GRID_SETTINGS.page_size,
    marginMm: GRID_SETTINGS.margin,
    columns: GRID_SETTINGS.columns,
    rowHeightMm: GRID_SETTINGS.row_height_mm,
    gutterMm: GRID_SETTINGS.gutter_mm,
  })!;

  const catalogue = materializeBaseShapes(grid);
  const shapeIdFor = (newspaperId: string, key: string) =>
    newspaperId === "paper_alpha" ? `shape_${key}` : `shape_beta_${key}`;

  for (const p of papers) {
    for (const shape of catalogue) {
      const row = {
        id: shapeIdFor(p.id, shape.key),
        newspaper_id: p.id,
        name: shape.name,
        cols: shape.cols,
        rows: shape.rows,
        position_mode: shape.positionMode,
        allowed_cells:
          shape.allowedCells === null
            ? Prisma.DbNull
            : { cells: shape.allowedCells.map(([col, r]) => [col, r]) },
      };
      await prisma.adShape.upsert({ where: { id: row.id }, update: row, create: row });
    }
  }

  // Page types for the alpha newspaper, with allowed shapes.
  const pageTypes = [
    {
      id: "pt_cover",
      newspaper_id: "paper_alpha",
      name: "שער",
      shapes: ["shape_strip", "shape_quarter"],
    },
    {
      id: "pt_inner",
      newspaper_id: "paper_alpha",
      name: "פנימי",
      shapes: ["shape_full", "shape_half_h", "shape_half_v", "shape_quarter", "shape_eighth"],
    },
    {
      id: "pt_back",
      newspaper_id: "paper_alpha",
      name: "אחורי",
      shapes: ["shape_full", "shape_half_h"],
    },
  ];
  for (const pt of pageTypes) {
    await prisma.pageType.upsert({
      where: { id: pt.id },
      update: { name: pt.name },
      create: { id: pt.id, newspaper_id: pt.newspaper_id, name: pt.name },
    });
    for (const shapeId of pt.shapes) {
      await prisma.allowedAdShape.upsert({
        where: { page_type_id_ad_shape_id: { page_type_id: pt.id, ad_shape_id: shapeId } },
        update: {},
        create: { newspaper_id: pt.newspaper_id, page_type_id: pt.id, ad_shape_id: shapeId },
      });
    }
  }

  // Prices for the alpha newspaper, so the order builder has base prices to
  // suggest and pricing-immutability has something to change.
  const shapesAlpha = await prisma.adShape.findMany({ where: { newspaper_id: "paper_alpha" } });
  const inner = shapesAlpha.find((s) => s.name.includes("רבע")) ?? shapesAlpha[0];
  if (inner) {
    await prisma.priceRule.upsert({
      where: {
        newspaper_id_page_type_id_ad_shape_id: {
          newspaper_id: "paper_alpha",
          page_type_id: "pt_inner",
          ad_shape_id: inner.id,
        },
      },
      update: { price: 1200 },
      create: {
        newspaper_id: "paper_alpha",
        page_type_id: "pt_inner",
        ad_shape_id: inner.id,
        price: 1200,
      },
    });
  }

  console.log(
    "seeded 2 businesses, 6 users,",
    customers.length,
    "customers,",
    catalogue.length * papers.length,
    "ad shapes, 2 newspapers. password:",
    PASSWORD,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
