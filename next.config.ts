import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Anchor Turbopack to this project (a stray package-lock.json exists in the
  // user home directory and would otherwise be picked up as the workspace root).
  turbopack: { root: __dirname },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors *;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
