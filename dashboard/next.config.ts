import type { NextConfig } from "next";
import path from 'path';
const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.jsdelivr.net",
        pathname: "/gh/devicons/devicon/**",
      },
    ],
  },
  turbopack: {
      root:path.join(__dirname),
  }
};

export default nextConfig;
