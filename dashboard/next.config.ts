import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    output: "standalone",
    experimental: {
        proxyClientMaxBodySize: "1024mb",
        serverActions: {
            bodySizeLimit: "1024mb",
        },
    },
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
