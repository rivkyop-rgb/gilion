import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

// Prisma 7 moved the connection URL out of schema.prisma. The CLI (migrate,
// studio) reads it from here. The driver adapter is a runtime concern and is
// passed to the PrismaClient constructor in lib/db.ts instead.
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: { path: path.join("prisma", "migrations") },
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
