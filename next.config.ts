import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack is the default bundler in Next.js 16.
  // .splat files live in /public and are served as plain static assets —
  // no bundler processing required.
  // The gaussian-splats-3d library is dynamically imported inside a
  // useEffect (client-only), so it is never included in the server bundle.
  turbopack: {},
};

export default nextConfig;
