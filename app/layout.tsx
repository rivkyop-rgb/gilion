import type { Metadata } from "next";
import { Frank_Ruhl_Libre, Heebo, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// conventions.md §1 — all three fonts carry full Hebrew coverage except
// JetBrains Mono, which is only used for Latin metadata.
const frankRuhl = Frank_Ruhl_Libre({
  variable: "--font-frank-ruhl",
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700"],
});

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Gilion",
  description: "מערכת לניהול פרסום בעיתון",
  icons: { icon: "/brand/favicon.svg" },
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
      className={`${frankRuhl.variable} ${heebo.variable} ${jetbrainsMono.variable}`}
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
