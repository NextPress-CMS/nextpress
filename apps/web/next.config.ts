import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Monorepo root, so file tracing includes workspace packages and Next stops
  // guessing the root from stray lockfiles.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  poweredByHeader: false,
  transpilePackages: [
    "@nextpress/core",
    "@nextpress/blocks",
    "@nextpress/api",
    "@nextpress/ui",
    "@nextpress/editor",
    "@nextpress/default",
    "@nextpress/twentytwentysix",
  ],
  serverExternalPackages: [
    "@nextpress/db",
    "@prisma/client",
    ".prisma/client",
    "bcryptjs",
    "isomorphic-dompurify",
    "jsdom",
    "dompurify",
    "sharp",
    "adm-zip",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=()",
          },
          {
            // No `preload`/`includeSubDomains`: sites may run on custom
            // domains whose owners have not opted every subdomain into HTTPS.
            key: "Strict-Transport-Security",
            value: "max-age=63072000",
          },
          {
            // Baseline CSP that does not break inline Next.js scripts: blocks
            // plugins/embeds, <base> hijacking, and
            // framing by other sites. Tighten with nonces when ready.
            key: "Content-Security-Policy",
            value: "object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
