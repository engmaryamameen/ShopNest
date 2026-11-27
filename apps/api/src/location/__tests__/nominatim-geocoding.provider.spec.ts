import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NominatimGeocodingProvider } from '../nominatim-geocoding.provider';

describe('NominatimGeocodingProvider', () => {
  const config = new ConfigService({
    app: {
      geocodingUrl: 'https://geocoding.example',
      geocodingTimeoutMs: 5000,
    },
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns a concise locality and delivery details', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          display_name: 'Gulberg, Lahore, Punjab, Pakistan',
          address: { city: 'Lahore', state: 'Punjab', postcode: '54660', country: 'Pakistan' },
        }),
        { status: 200 },
      ),
    );
    const provider = new NominatimGeocodingProvider(config);

    await expect(provider.reverse(31.5204, 74.3587)).resolves.toEqual({
      label: 'Lahore',
      details: 'Punjab, 54660, Pakistan',
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: 'geocoding.example',
        pathname: '/reverse',
      }),
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: 'application/json' }),
      }),
    );
  });

  it('does not leak an upstream failure to the client', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 503 }));
    const provider = new NominatimGeocodingProvider(config);

    await expect(provider.reverse(31.5204, 74.3587)).rejects.toBeInstanceOf(BadGatewayException);
  });
});
