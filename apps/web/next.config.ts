import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
