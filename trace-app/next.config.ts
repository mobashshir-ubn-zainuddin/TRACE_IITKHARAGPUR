import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Next.js 16: `false` fully disables the dev tools indicator overlay.
  devIndicators: false,
};

export default nextConfig;
