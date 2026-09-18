import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/**
 * The NEXUS hub is meant to be embedded (Google Sites and friends), so it opts
 * out of the site-wide frame ban. Everything else keeps X-Frame-Options: DENY.
 */
const embeddableHeaders = securityHeaders
  .filter((h) => h.key !== "X-Frame-Options")
  .concat({ key: "Content-Security-Policy", value: "frame-ancestors *" });

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/nexus.html", headers: embeddableHeaders },
      { source: "/((?!nexus\\.html$).*)", headers: securityHeaders },
    ];
  },
};

export default nextConfig;
