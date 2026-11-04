import type { NextConfig } from "next";

import { UPLOAD_TRANSPORT_LIMIT_BYTES } from "./lib/domain/ad-file";

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

  // Native and worker-based packages must stay OUTSIDE the server bundle.
  //
  // sharp ships a platform-specific binary, and pdf-to-img loads pdf.js plus
  // @napi-rs/canvas at runtime. Bundled, they resolve their own assets against
  // the bundle rather than node_modules and fail silently — which surfaces as
  // an upload that works but never produces a preview, with nothing in the log.
  // playwright-core joins them for the same reason (stage 07): it resolves the
  // Chromium binary and its own driver against node_modules at runtime, and a
  // bundled copy looks for both against the bundle and finds neither.
  serverExternalPackages: [
    "sharp",
    "pdf-to-img",
    "@napi-rs/canvas",
    "pdfjs-dist",
    "playwright-core",
  ],

  // Which framework built the page is nobody's business (security review,
  // 04/11/2026).
  poweredByHeader: false,

  // Baseline headers on every response (security review, 04/11/2026):
  // - no framing, so the app cannot be shown inside another site that makes a
  //   signed-in user click something they cannot see (clickjacking);
  // - no MIME sniffing, so an uploaded file is never run as something else;
  // - the full address only to our own pages: a signed link (designer,
  //   customer file view) must not travel to WhatsApp or Gmail in Referer.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },

  experimental: {
    // Server Actions cap request bodies at 1 MB by default, and an ad file is
    // routinely larger than that. Without this the upload fails in the
    // framework BEFORE any of our validation runs, so a 12 MB file gets a
    // generic error instead of "too large for newspaper X" (FR-21).
    //
    // This is a transport ceiling, not a policy: the real limit stays
    // per-newspaper in max_ad_file_size, and lib/domain/newspaper.ts refuses to
    // configure one above this number.
    serverActions: { bodySizeLimit: UPLOAD_TRANSPORT_LIMIT_BYTES },

    // The SECOND cap on the same request, and the one that is easy to miss.
    // middleware.ts runs on the upload route, so Next buffers the body to let
    // both the proxy and the action read it — and that buffer has its own 10 MB
    // default. Exceeding it truncates the body silently and the action fails
    // with "Unexpected end of form" rather than any of our validation. Both
    // numbers therefore track UPLOAD_TRANSPORT_LIMIT_BYTES.
    proxyClientMaxBodySize: UPLOAD_TRANSPORT_LIMIT_BYTES,
  },
};

export default nextConfig;
