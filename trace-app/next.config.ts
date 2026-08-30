import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: {
    buildActivity: false,
    buildActivityPosition: "bottom-right",
  },
};

export default nextConfig;
