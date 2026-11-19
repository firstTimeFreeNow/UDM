import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@udm/contracts"],
  output: "export",
  basePath: "/UDM",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
