import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["zenyauth"],
  experimental: {
    externalDir: true
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com"
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com"
      }
    ]
  }
};

export default nextConfig;
