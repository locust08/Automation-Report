import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Keep CI type safety via `npm run typecheck`; avoid Next.js internal spawn issue on this host.
    ignoreBuildErrors: true,
  },
  outputFileTracingIncludes: {
    "/api/cron/monthly-report": ["./node_modules/@sparticuz/chromium/bin/**/*"],
    "/api/report-pdf/monthly": ["./node_modules/@sparticuz/chromium/bin/**/*"],
    "/api/reports/manual-send": ["./node_modules/@sparticuz/chromium/bin/**/*"],
  },
};

export default nextConfig;
