import type { Metadata } from "next";
import { JetBrains_Mono, Rubik } from "next/font/google";
import { DEFAULT_BRAND } from "@/components/brand/brand-mark";
import "./globals.css";

// conventions.md §1 — one family for the whole interface (user's choice,
// 29/09/2026): Rubik, for headings and UI alike. It replaced Frank Ruhl Libre
// (headings) + Google Sans (UI). The variable axis covers 300–900, so every
// weight the design uses comes from one file.
const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["hebrew", "latin"],
  display: "swap",
});

// Latin metadata only (invoice ids, dimensions).
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Gilion",
  description: "מערכת לניהול פרסום בעיתון",
  /**
   * The fallback icon only. A signed-in page overrides it per business from
   * app/(internal)/layout.tsx — this is what /login and anything outside a
   * business shows, and it is the same file every new business starts with.
   */
  icons: { icon: DEFAULT_BRAND.favicon },
};

// The font variables belong on <html>, not <body>. globals.css declares
// --font-sans on :root as var(--font-rubik), ...; a custom property that
// references an undefined variable resolves to nothing at its declaration site,
// so with the classes on <body> every font silently falls back to the system
// stack while still looking wired up.
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html dir="rtl" lang="he" className={`${rubik.variable} ${jetbrainsMono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
