import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Two project rules are written here in stage 00 on purpose: once hundreds of
 * components exist, retrofitting either one is a migration rather than a lint fix.
 *   1. RTL — logical properties only (conventions.md §1)
 *   2. Layering — Prisma stays inside lib/data/ (conventions.md §2)
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    rules: {
      // 1. RTL: physical direction utilities break in Hebrew. Use ms-/me-/ps-/pe-/start-/end-.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXAttribute[name.name='className'] Literal[value=/(^|\\s)-?(ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r|text-left|text-right)-/]",
          message:
            "RTL: השתמשי ב־logical properties (ms-/me-/ps-/pe-/start-/end-/text-start/text-end) ולא בכיוון פיזי. ראה conventions.md §1.",
        },
        {
          selector:
            "JSXAttribute[name.name='className'] TemplateElement[value.raw=/(^|\\s)-?(ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r|text-left|text-right)-/]",
          message:
            "RTL: השתמשי ב־logical properties (ms-/me-/ps-/pe-/start-/end-/text-start/text-end) ולא בכיוון פיזי. ראה conventions.md §1.",
        },
      ],

      // 2. Layering: only lib/data/ may touch Prisma directly.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@prisma/client",
              message:
                "גישה ישירה ל־Prisma מותרת רק ב־lib/data/. השתמשי ב־db המורחב. ראה conventions.md §2.",
            },
          ],
        },
      ],
    },
  },

  // lib/data/ is the one layer allowed to import Prisma in application code.
  // Seeds and E2E fixtures are exempt on purpose: their whole job is to set up
  // data across tenants, which the scoped client is designed to make impossible.
  {
    files: ["lib/data/**/*.ts", "prisma/**/*.ts", "e2e/**/*.ts"],
    rules: { "no-restricted-imports": "off" },
  },

  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "playwright-report/**"]),
]);

export default eslintConfig;
