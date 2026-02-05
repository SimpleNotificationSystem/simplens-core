import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
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
};

export default nextConfig;
