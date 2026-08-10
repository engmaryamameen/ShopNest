export const DELIVERY_LOCATION_STORAGE_KEY = 'shopnest.delivery-location.v1';

export type DeliveryLocation = {
  label: string;
  details: string;
  source: 'device' | 'manual';
};

export function readDeliveryLocation(storage: Pick<Storage, 'getItem'>): DeliveryLocation | null {
  const value = storage.getItem(DELIVERY_LOCATION_STORAGE_KEY);
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<DeliveryLocation>;
    if (
      typeof parsed.label !== 'string' ||
      typeof parsed.details !== 'string' ||
      (parsed.source !== 'device' && parsed.source !== 'manual')
    ) {
      return null;
    }
    return { label: parsed.label, details: parsed.details, source: parsed.source };
  } catch {
    return null;
  }
}

export function writeDeliveryLocation(
  storage: Pick<Storage, 'setItem'>,
  location: DeliveryLocation,
) {
  storage.setItem(DELIVERY_LOCATION_STORAGE_KEY, JSON.stringify(location));
}
