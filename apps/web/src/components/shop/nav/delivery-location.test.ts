import {
  DELIVERY_LOCATION_STORAGE_KEY,
  readDeliveryLocation,
  writeDeliveryLocation,
  type DeliveryLocation,
} from './delivery-location';

describe('delivery location persistence', () => {
  it('round-trips a valid location', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const location: DeliveryLocation = {
      label: 'Lahore',
      details: 'Punjab, Pakistan',
      source: 'device',
    };

    writeDeliveryLocation(storage, location);

    expect(values.has(DELIVERY_LOCATION_STORAGE_KEY)).toBe(true);
    expect(readDeliveryLocation(storage)).toEqual(location);
  });

  it('ignores malformed or outdated values', () => {
    expect(readDeliveryLocation({ getItem: () => '{not-json' })).toBeNull();
    expect(readDeliveryLocation({ getItem: () => JSON.stringify({ label: 'Lahore' }) })).toBeNull();
  });
});
