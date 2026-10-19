/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.AGCORE_BUILD_DIR || ".next",
  async redirects() {
    return [
      { source: "/analytics", destination: "/reports", permanent: true },
    ];
  },
};

export default nextConfig;
