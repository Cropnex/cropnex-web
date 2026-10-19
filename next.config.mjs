/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.CROPNEX_BUILD_DIR || ".next",
  async redirects() {
    return [
      { source: "/analytics", destination: "/reports", permanent: true },
    ];
  },
};

export default nextConfig;
