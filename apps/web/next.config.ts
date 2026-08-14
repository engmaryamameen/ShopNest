import type { NextConfig } from 'next';

const INTERNAL_API_URL =
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3001';

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      // Locally-uploaded media (LocalMediaStorageAdapter) is served back
      // from the API's own origin — http in dev, since MEDIA_PUBLIC_BASE_URL
      // defaults to plain localhost. A real deployment's MEDIA_PUBLIC_BASE_URL
      // is https, already covered by the pattern above.
      {
        protocol: 'http',
        hostname: 'localhost',
      },
    ],
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
