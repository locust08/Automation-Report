import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Keep CI type safety via `npm run typecheck`; avoid Next.js internal spawn issue on this host.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
