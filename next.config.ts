import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16 refuses to serve /_next/static and /_next/hmr to a dev request whose
  // origin is not listed here, which leaves the page rendered but with no
  // JavaScript — every control silently stops responding.
  //
  // This app is reached from three places during development: the loopback
  // address, Playwright (127.0.0.1) and a browser on another machine hitting
  // the VPS by IP or hostname. Listing them all keeps the dev server usable
  // from a remote browser; production serves static assets normally and is
  // unaffected.
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "169.58.56.195",
    // The VPS is also reachable by hostname through the panel's proxy.
    "*.local",
  ],
};

export default nextConfig;
