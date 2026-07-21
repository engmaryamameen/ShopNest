import type { NextConfig } from 'next';

// Internal URL used for server→server calls to the NestJS API.
// In Docker Compose, this is http://api:3001. Locally it defaults to the public URL.
const INTERNAL_API_URL =
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3001';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },

  /**
   * Proxy /api/* → NestJS backend.
   * Browser-side fetches use a relative /api path (same-origin), so:
   *   - Cookies are sent automatically without SameSite=None.
   *   - No CORS preflight is required for mutations.
   *   - The OriginGuard on the API sees this server's origin.
   * Server-side fetches bypass the proxy and call INTERNAL_API_URL directly.
   */
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${INTERNAL_API_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
