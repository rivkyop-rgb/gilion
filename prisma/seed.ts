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

  console.log("seeded 2 businesses, 6 users,", customers.length, "customers. password:", PASSWORD);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
