import type { NextConfig } from 'next';
import { resolveApprovedOrigins } from '@shopnest/media-origins';

const INTERNAL_API_URL =
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3001';

const APPROVED_ORIGINS = resolveApprovedOrigins(process.env.MEDIA_PUBLIC_BASE_URL, INTERNAL_API_URL);

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: APPROVED_ORIGINS.map((origin) => ({
      protocol: origin.protocol,
      hostname: origin.hostname,
      port: origin.port,
    })),
  },

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
