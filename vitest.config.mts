import "dotenv/config";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: {
    // Database-backed suites (tenant, audit) need node, not jsdom.
    environment: "node",
    globals: true,
    // e2e/ belongs to Playwright; Vitest must not try to run it.
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules/**", ".next/**", "e2e/**"],
  },
  resolve: { alias: { "@": path.dirname(fileURLToPath(import.meta.url)) } },
});
