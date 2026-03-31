import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    /** Lint in CI / `npm run lint`; avoid blocking `next build` on rule/plugin drift (e.g. react-hooks presets). */
    ignoreDuringBuilds: true,
  },
  transpilePackages: ["@hive/buyer-config", "@base-ui/react"],
  /**
   * Webpack is the default production bundler here. Turbopack’s resolver can fail on `file:`-linked
   * packages (symlink/junction to `../packages/a2a-sdk`) on Windows.
   * `@base-ui/react` subpath imports (`@base-ui/react/button`, etc.) are transpiled so webpack resolves `exports` reliably.
   * Do not list `@hive/a2a-sdk` in `transpilePackages` when it is in `serverExternalPackages`.
   */
  serverExternalPackages: [
    "postgres",
    "ioredis",
    "dockerode",
    "bcryptjs",
    "@hive/a2a-sdk",
    "@opentelemetry/sdk-node",
    "@opentelemetry/sdk-metrics",
    "@opentelemetry/sdk-trace-base",
    "@opentelemetry/sdk-trace-node",
    "@opentelemetry/exporter-trace-otlp-http",
    "@opentelemetry/exporter-metrics-otlp-http",
    "@opentelemetry/core",
    "@opentelemetry/context-async-hooks",
  ],
  output: "standalone",
  compress: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  reactStrictMode: true,

  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-DNS-Prefetch-Control", value: "on" },
        { key: "X-Download-Options", value: "noopen" },
        { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
      ],
    },
    {
      source: "/_next/static/(.*)",
      headers: [
        { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
      ],
    },
    {
      source: "/api/(.*)",
      headers: [
        { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
      ],
    },
  ],

};

export default nextConfig;
