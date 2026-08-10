import { LocationService } from '../location.service';
import type { GeocodingProvider } from '../location.types';

describe('LocationService', () => {
  it('delegates reverse geocoding to its provider', async () => {
    const provider: GeocodingProvider = {
      reverse: jest.fn().mockResolvedValue({ label: 'Lahore', details: 'Punjab, Pakistan' }),
      search: jest.fn().mockResolvedValue([]),
    };
    const service = new LocationService(provider);

    await expect(service.reverse(31.5204, 74.3587)).resolves.toEqual({
      label: 'Lahore',
      details: 'Punjab, Pakistan',
    });
    expect(provider.reverse).toHaveBeenCalledWith(31.5204, 74.3587);
  });
});
