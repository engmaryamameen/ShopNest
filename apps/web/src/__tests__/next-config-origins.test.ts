import { resolveApprovedOrigins } from '@shopnest/media-origins';
import nextConfig from '../../next.config';

describe('next.config.ts image origins', () => {
  it('resolves to exactly the same effective origin set as the API-side validator', () => {
    const expected = resolveApprovedOrigins(process.env.MEDIA_PUBLIC_BASE_URL, 'http://localhost:3001');

    expect(nextConfig.images?.remotePatterns).toHaveLength(expected.length);
    expected.forEach((origin, i) => {
      expect(nextConfig.images?.remotePatterns?.[i]).toEqual(
        expect.objectContaining({ protocol: origin.protocol, hostname: origin.hostname }),
      );
    });
  });

  it('includes the exact approved Amazon host', () => {
    const hostnames = nextConfig.images?.remotePatterns?.map((p) => (p as { hostname: string }).hostname);
    expect(hostnames).toContain('m.media-amazon.com');
  });

  it('never falls back to a wildcard hostname', () => {
    const hostnames = nextConfig.images?.remotePatterns?.map((p) => (p as { hostname: string }).hostname);
    expect(hostnames).not.toContain('**');
  });
});
