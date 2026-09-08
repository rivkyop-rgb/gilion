import type { Metadata } from "next";
import { Frank_Ruhl_Libre, JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";
import { DEFAULT_BRAND } from "@/components/brand/brand-mark";
import "./globals.css";

// conventions.md §1 — all three fonts carry full Hebrew coverage except
// JetBrains Mono, which is only used for Latin metadata.
const frankRuhl = Frank_Ruhl_Libre({
  variable: "--font-frank-ruhl",
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700"],
});

// Google Sans replaces Heebo as the UI sans (user's choice, 23/08/2026).
// Self-hosted rather than fetched from Google Fonts: it is not served by the
// Google Fonts CSS API, and the file ships under the OFL (app/fonts/GoogleSans-OFL.txt).
// Verified to carry full Hebrew coverage — all 22 letters plus the shekel sign.
const googleSans = localFont({
  src: "./fonts/GoogleSans-Variable.ttf",
  variable: "--font-google-sans",
  weight: "100 900",
  display: "swap",
});

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
// --font-serif on :root as var(--font-frank-ruhl), ...; a custom property that
// references an undefined variable resolves to nothing at its declaration site,
// so with the classes on <body> every font silently falls back to the system
// stack while still looking wired up.
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      dir="rtl"
      lang="he"
      className={`${frankRuhl.variable} ${googleSans.variable} ${jetbrainsMono.variable}`}
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
