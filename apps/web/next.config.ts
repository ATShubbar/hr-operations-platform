import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Proxy /api/* to the NestJS API so the browser talks to a single origin —
// the httpOnly session cookie then flows without CORS. Target is env-overridable
// for staging/prod (where the platform sits behind one gateway).
const API_TARGET = process.env.API_PROXY_TARGET ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_TARGET}/:path*` }];
  },
};

export default withNextIntl(nextConfig);
