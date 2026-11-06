/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.CROPNEX_BUILD_DIR || ".next",
  async headers(){return [{source:'/login',headers:[{key:'Cache-Control',value:'private, no-store, max-age=0'}]},{source:'/auth/:path*',headers:[{key:'Cache-Control',value:'private, no-store, max-age=0'}]}];},
  async redirects() {
    return [
      { source: "/analytics", destination: "/reports", permanent: true },
    ];
  },
};

export default nextConfig;
