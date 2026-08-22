import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright drives the app over 127.0.0.1 while the dev server binds
  // localhost. Next 16 treats that as a cross-origin dev request and blocks
  // /_next/static and /_next/hmr, which silently strips the CSS and fonts.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
