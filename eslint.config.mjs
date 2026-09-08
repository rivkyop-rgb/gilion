import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Two project rules are written here in stage 00 on purpose: once hundreds of
 * components exist, retrofitting either one is a migration rather than a lint fix.
 *   1. RTL — logical properties only (conventions.md §1)
 *   2. Layering — Prisma stays inside lib/data/ (conventions.md §2)
 *
 * A third joined them in stage 11:
 *   3. Branding — no colour literal and no logo path outside the two files that
 *      own them, because either one is a value the admin panel cannot reach.
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

        // 3a. A hex colour written into a component is a colour the admin panel
        // cannot change, and it looks exactly like every other colour until the
        // day the brand moves and one badge stays the old blue (stage 11).
        {
          selector:
            "Literal[value=/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]",
          message:
            "צבע מקושח. השתמשי בטוקן (bg-primary, text-status-error-fg…). ערכי ברירת המחדל יושבים ב־lib/domain/theme-tokens.ts בלבד. ראה שלב 11.",
        },
        // 3b. Same rule for the logo: every consumer renders <BrandMark />, and
        // the one file that maps a slot to a path is components/brand/.
        {
          selector: "Literal[value=/^\\/brand\\//]",
          message:
            "נתיב לוגו מקושח. השתמשי ב־<BrandMark />; הנתיבים יושבים ב־components/brand/brand-mark.tsx בלבד. ראה שלב 11.",
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
    // `.mts` too: a standalone repair script has to be ESM to use top-level
    // await, and the extension is a module-format detail, not a layer.
    files: ["lib/data/**/*.ts", "prisma/**/*.{ts,mts}", "e2e/**/*.ts"],
    rules: { "no-restricted-imports": "off" },
  },

  /*
   * The two files that OWN the literals rule 3 forbids everywhere else, plus
   * the places a colour is data rather than design:
   *   - theme-tokens.ts is the default palette, by definition.
   *   - brand-mark.tsx is the slot→path map, by definition.
   *   - globals.css is not linted here at all; it is the stylesheet.
   *   - tests and seeds assert on and produce colours; a test that may not
   *     write "#123456" cannot check that "#123456" was stored.
   */
  {
    files: [
      "lib/domain/theme-tokens.ts",
      "components/brand/brand-mark.tsx",
      "**/*.test.ts",
      "**/*.test.tsx",
      "e2e/**/*.ts",
      "prisma/**/*.{ts,mts}",
    ],
    rules: { "no-restricted-syntax": "off" },
  },

  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "playwright-report/**"]),
]);

export default eslintConfig;
