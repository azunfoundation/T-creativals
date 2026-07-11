import type { NextConfig } from "next";

// The production image host is derived from NEXT_PUBLIC_API_URL at build
// time so no deployment-specific hostname lives in the repo.
const apiHostname = (() => {
  try {
    const host = new URL(process.env.NEXT_PUBLIC_API_URL ?? "").hostname;
    return host && host !== "localhost" ? host : null;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  // Standalone output for Docker production deployment
  output: "standalone",
  // Allow images served from the backend API host
  images: {
    remotePatterns: [
      ...(apiHostname
        ? [{ protocol: "https" as const, hostname: apiHostname, pathname: "/**" }]
        : []),
      {
        protocol: "http",
        hostname: "localhost",
        port: "8000",
        pathname: "/**",
      },
    ],
  },

  // Security headers for production
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
