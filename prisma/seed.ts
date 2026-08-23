import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

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

  // Ad shapes are GLOBAL — shared by every business (conventions.md §2).
  const shapes = [
    { id: "shape_full", name: "עמוד מלא", size_group: "full" as const },
    { id: "shape_half_h", name: "חצי עמוד אופקי", size_group: "half" as const },
    { id: "shape_half_v", name: "חצי עמוד אנכי", size_group: "half" as const },
    { id: "shape_quarter", name: "רבע עמוד", size_group: "quarter" as const },
    { id: "shape_eighth", name: "שמינית עמוד", size_group: "eighth" as const },
    { id: "shape_strip", name: "רצועה תחתונה", size_group: "strip" as const },
  ];
  for (const s of shapes) {
    await prisma.adShape.upsert({ where: { id: s.id }, update: s, create: s });
  }

  // One configured newspaper per business, so stage 03 screens have something
  // real to show and tenant isolation stays testable.
  const papers = [
    { id: "paper_alpha", business_id: alpha.id, name: "עיתון השבוע" },
    { id: "paper_beta", business_id: beta.id, name: "מקומון הצפון" },
  ];
  for (const p of papers) {
    await prisma.newspaper.upsert({
      where: { id: p.id },
      update: { name: p.name },
      create: {
        ...p,
        page_size: "Tabloid",
        margin: 10,
        print_quality: "דפוס אופסט רגיל",
        max_ad_file_size: 10 * 1024 * 1024,
      },
    });
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
        create: { page_type_id: pt.id, ad_shape_id: shapeId },
      });
    }
  }

  console.log(
    "seeded 2 businesses, 6 users,",
    customers.length,
    "customers,",
    shapes.length,
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
