'use client';

import { useEffect, useState } from 'react';
import { MapPinIcon } from '@/assets/icons';
import {
  readDeliveryLocation,
  writeDeliveryLocation,
  type DeliveryLocation,
} from './delivery-location';
import { LocationDialog } from './location-dialog';
import { FOCUS_RING } from './styles';

export function LocationDisplay() {
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useState<DeliveryLocation | null>(null);

  useEffect(() => {
    setLocation(readDeliveryLocation(window.localStorage));
  }, []);

  function saveLocation(nextLocation: DeliveryLocation) {
    writeDeliveryLocation(window.localStorage, nextLocation);
    setLocation(nextLocation);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={
          location
            ? `Delivery location: ${location.label}. Change location`
            : 'Choose delivery location'
        }
        className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center gap-[7px] rounded-md text-left text-black transition hover:bg-black/[0.04] xl:h-[46px] xl:w-auto xl:justify-start xl:px-2 ${FOCUS_RING}`}
      >
        <MapPinIcon className="h-5 w-5 shrink-0" />
        <span className="hidden min-w-0 xl:block">
          <span className="block text-[9px] font-normal leading-[15px] text-black/50">
            Deliver to
          </span>
          <span className="block max-w-[120px] truncate text-[12px] font-medium leading-[18px]">
            {location?.label ?? 'Your location'}
          </span>
        </span>
      </button>

      <LocationDialog
        open={open}
        currentLocation={location}
        onClose={() => setOpen(false)}
        onSave={saveLocation}
      />
    </>
  );
}
