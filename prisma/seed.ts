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

  // The BUSINESS is the publisher; the NEWSPAPERS are what it publishes. They
  // were previously given the same names ("עיתון השבוע" was both), which put
  // the same label in the business switcher and in the newspaper list one
  // level below it — reading as though the paper contained itself. The model
  // was never wrong, only the seed data made it look duplicated.
  const alpha = await prisma.business.upsert({
    where: { id: "biz_alpha" },
    update: { name: "הוצאת המרכז", slug: "merkaz" },
    create: { id: "biz_alpha", name: "הוצאת המרכז", slug: "merkaz" },
  });
  const beta = await prisma.business.upsert({
    where: { id: "biz_beta" },
    update: { name: "הוצאת הצפון", slug: "tzafon" },
    create: { id: "biz_beta", name: "הוצאת הצפון", slug: "tzafon" },
  });

  const people = [
    // The admin of ONE business, which is what a real customer's admin is.
    //
    // This user used to belong to both businesses so that the picker had
    // something to pick, and the effect was to make the system look as though
    // any admin could reach any tenant. It cannot: the picker lists only
    // businesses the user has a membership in, and setActiveBusiness
    // re-validates that membership server-side. But demo data that contradicts
    // the security model is worth fixing, because nobody should have to read
    // the source to be reassured.
    {
      id: "usr_admin",
      name: "רבקי מנהלת",
      email: "admin@gilion.test",
      role: "admin" as const,
      businesses: [alpha.id],
    },
    // FR-2 is a real requirement — one person can legitimately work for two
    // publishers (an accountant serving both). It gets its own user rather
    // than being folded into the everyday admin.
    {
      id: "usr_multi",
      name: "יעל רואת חשבון",
      email: "multi@gilion.test",
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

  // The platform owner. No membership rows on purpose — the flag is what lets
  // them into every business, and giving them memberships too would make the
  // two mechanisms disagree the moment a business is added.
  await prisma.user.upsert({
    where: { id: "usr_super" },
    update: {
      name: "מנהל־על",
      email: "super@gilion.test",
      password_hash: hash,
      user_type: "internal",
      is_super_admin: true,
    },
    create: {
      id: "usr_super",
      name: "מנהל־על",
      email: "super@gilion.test",
      password_hash: hash,
      user_type: "internal",
      is_super_admin: true,
    },
  });

  // Memberships are declarative: whatever a person is NOT listed with here is
  // removed. Upsert alone only ever adds, so narrowing someone's access in this
  // file used to have no effect on a database that had already been seeded —
  // the old row simply survived and the change looked applied while it was not.
  const declared = new Set(people.flatMap((p) => p.businesses.map((b) => `${p.id}:${b}`)));

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

  // Customer-portal users (stage 09). Their memberships are written below, once
  // the customers they belong to exist — the CHECK constraint on
  // UserMembership refuses role = customer without a customer_id.

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

  // Two portal logins at two DIFFERENT customers of the same business — the
  // pair portal-isolation.spec.ts needs. Isolation between customers cannot be
  // shown with one, and isolation between businesses is already stage 01's.
  const portalUsers = [
    {
      id: "usr_customer",
      name: "יעל אבידן",
      email: "customer@gilion.test",
      customer: "cust_alpha_1",
    },
    {
      id: "usr_customer_2",
      name: "דוד הדר",
      email: "customer2@gilion.test",
      customer: "cust_alpha_3",
    },
  ];
  for (const u of portalUsers) {
    const row = {
      name: u.name,
      email: u.email,
      password_hash: hash,
      user_type: "customer" as const,
    };
    await prisma.user.upsert({ where: { id: u.id }, update: row, create: { id: u.id, ...row } });
    await prisma.userMembership.upsert({
      where: { user_id_business_id: { user_id: u.id, business_id: alpha.id } },
      update: { role: "customer", customer_id: u.customer, status: "active" },
      create: {
        user_id: u.id,
        business_id: alpha.id,
        role: "customer",
        customer_id: u.customer,
        status: "active",
      },
    });
  }

  // Drop memberships this file no longer declares.
  const staleFor = people.map((p) => p.id);
  const existing = await prisma.userMembership.findMany({
    where: { user_id: { in: staleFor } },
    select: { id: true, user_id: true, business_id: true },
  });
  for (const m of existing) {
    if (!declared.has(`${m.user_id}:${m.business_id}`)) {
      await prisma.userMembership.delete({ where: { id: m.id } });
    }
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

  // The publisher owns SEVERAL newspapers, and its customers are shared across
  // all of them — a customer is created once and then simply picked a place to
  // advertise in each time. That is the shape the business actually has, and
  // seeding only one paper per business hid it.
  //
  // beta stays a second PUBLISHER on purpose and is not redundant: it is what
  // proves one publisher cannot reach another's data (FR-1), and the tenant
  // isolation specs are written against it. Nobody working in the alpha
  // publisher ever sees it.
  //
  // publication_days are JS getDay() numbers (0 = Sunday). Three different
  // schedules on purpose, so the order builder's warning is demonstrable
  // without editing settings first.
  //
  // max_ad_file_size differs between the two alpha papers ON PURPOSE. FR-21
  // says the ceiling belongs to the newspaper, and a seed where every paper
  // allows the same 10 MB cannot tell a working per-newspaper limit apart from
  // a hard-coded constant — which is exactly the bug the requirement exists to
  // prevent. The catalogue is the strict one, at 5 MB.
  const papers = [
    {
      id: "paper_alpha",
      business_id: alpha.id,
      name: "עיתון השבוע",
      publication_days: [2],
      max_ad_file_size: 10 * 1024 * 1024,
    },
    {
      id: "paper_catalog",
      business_id: alpha.id,
      name: "קטלוג המרכז",
      publication_days: [4],
      max_ad_file_size: 5 * 1024 * 1024,
    },
    {
      id: "paper_beta",
      business_id: beta.id,
      name: "מקומון הצפון",
      publication_days: [4],
      max_ad_file_size: 10 * 1024 * 1024,
    },
  ];
  for (const p of papers) {
    await prisma.newspaper.upsert({
      where: { id: p.id },
      update: {
        name: p.name,
        publication_days: p.publication_days,
        max_ad_file_size: p.max_ad_file_size,
        ...GRID_SETTINGS,
      },
      create: {
        ...p,
        ...GRID_SETTINGS,
        print_quality: "דפוס אופסט רגיל",
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
  // alpha keeps the unprefixed ids because the e2e specs address cells by
  // `cell-{pageTypeId}-{shapeId}`; every other newspaper gets its own prefix.
  // A shared prefix would have handed two newspapers the same shape ids.
  const SHAPE_PREFIX: Record<string, string> = {
    paper_alpha: "shape_",
    paper_catalog: "shape_catalog_",
    paper_beta: "shape_beta_",
  };
  const shapeIdFor = (newspaperId: string, key: string) =>
    `${SHAPE_PREFIX[newspaperId] ?? `shape_${newspaperId}_`}${key}`;

  for (const p of papers) {
    for (const shape of catalogue) {
      const row = {
        id: shapeIdFor(p.id, shape.key),
        newspaper_id: p.id,
        name: shape.name,
        cols: shape.cols,
        rows: shape.rows,
        position_mode: shape.positionMode,
        base_key: shape.key,
        allowed_cells:
          shape.allowedCells === null
            ? Prisma.DbNull
            : { cells: shape.allowedCells.map(([col, r]) => [col, r]) },
      };
      await prisma.adShape.upsert({ where: { id: row.id }, update: row, create: row });
    }
  }

  // Page types, with their allowed shapes. Both of the publisher's newspapers
  // get them: a newspaper with no page type cannot be ordered in at all, and
  // one that only half exists is worse demo data than one that does not.
  const pageTypes = [
    {
      id: "pt_cat_front",
      newspaper_id: "paper_catalog",
      name: "שער קטלוג",
      shapes: ["shape_catalog_quarter", "shape_catalog_eighth"],
    },
    {
      id: "pt_cat_inner",
      newspaper_id: "paper_catalog",
      name: "פנימי קטלוג",
      shapes: [
        "shape_catalog_full",
        "shape_catalog_half_h",
        "shape_catalog_quarter",
        "shape_catalog_eighth",
      ],
    },
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
    "seeded 2 businesses,",
    people.length + 1,
    "users,",
    customers.length,
    "customers,",
    catalogue.length * papers.length,
    "ad shapes,",
    papers.length,
    "newspapers. password:",
    PASSWORD,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
