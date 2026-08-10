'use client';

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';

import {
  CloseIcon,
  MapPinIcon,
} from '@/assets/icons';

import { api } from '@/lib/api';

import type { DeliveryLocation } from './delivery-location';

import { FOCUS_RING } from './styles';
import { useBodyScrollLock } from './use-body-scroll-lock';
import { useEscapeKey } from './use-escape-key';
import { useFocusTrap } from './use-focus-trap';

type LocationDialogProps = {
  open: boolean;
  currentLocation: DeliveryLocation | null;
  onClose: () => void;
  onSave: (location: DeliveryLocation) => void;
};

type Status = 'idle' | 'locating' | 'error';

const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 12_000,
  maximumAge: 300_000,
};

function geolocationMessage(
  error: GeolocationPositionError,
): string {
  if (error.code === error.PERMISSION_DENIED) {
    return 'Location access is blocked. Allow location permission in your browser settings, or enter a location manually.';
  }

  if (error.code === error.TIMEOUT) {
    return 'Finding your location took too long. Try again or enter it manually.';
  }

  return 'We could not determine your location. Try again or enter it manually.';
}

export function LocationDialog({
  open,
  currentLocation,
  onClose,
  onSave,
}: LocationDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [manualLocation, setManualLocation] = useState('');

  useBodyScrollLock(open);
  useEscapeKey(open, onClose);
  useFocusTrap(open, panelRef);

  useEffect(() => {
    if (!open) {
      setStatus('idle');
      setError('');
      setManualLocation('');
    }
  }, [open]);

  function useCurrentLocation() {
    setError('');

    if (!navigator.geolocation) {
      setStatus('error');
      setError(
        'Your browser does not support location detection. Enter your location manually.',
      );
      return;
    }

    setStatus('locating');

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const resolved = await api.reverseGeocode(
            coords.latitude,
            coords.longitude,
          );

          onSave({
            ...resolved,
            source: 'device',
          });

          onClose();
        } catch {
          setStatus('error');
          setError(
            'Your position was found, but we could not identify the area. Enter it manually below.',
          );
        }
      },
      (positionError) => {
        setStatus('error');
        setError(geolocationMessage(positionError));
      },
      GEOLOCATION_OPTIONS,
    );
  }

  function saveManualLocation(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const value = manualLocation
      .trim()
      .replace(/\s+/g, ' ');

    if (value.length < 3) {
      setStatus('error');
      setError(
        'Enter a city, area, postal code, or delivery address.',
      );
      return;
    }

    onSave({
      label: value,
      details: 'Manually selected delivery location',
      source: 'manual',
    });

    onClose();
  }

  if (!open) return null;

  return (
    <div
      className="
        fixed inset-0 z-[120]
        flex items-end justify-center
        font-poppins

        sm:items-center
        sm:p-6
      "
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close location dialog"
        onClick={onClose}
        className="
          absolute inset-0
          h-full w-full
          bg-black/40
          transition-opacity
        "
      />

      {/* Dialog / mobile bottom sheet */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-dialog-title"
        className="
          relative
          max-h-[90dvh]
          w-full
          overflow-y-auto
          rounded-t-[18px]
          bg-white
          shadow-[0_-12px_40px_rgba(0,0,0,0.14)]

          sm:max-w-[460px]
          sm:rounded-[10px]
          sm:shadow-[0_20px_60px_rgba(0,0,0,0.16)]
        "
      >
        {/* Mobile drag handle */}
        <div className="flex h-5 items-center justify-center sm:hidden">
          <span className="h-1 w-9 rounded-full bg-black/15" />
        </div>

        {/* Header */}
        <div
          className="
            flex items-start justify-between
            border-b border-black/[0.07]
            px-5 pb-4 pt-2

            sm:px-6
            sm:py-5
          "
        >
          <div className="pr-4">
            <h2
              id="location-dialog-title"
              className="
                text-[18px]
                font-semibold
                leading-[26px]
                text-black
              "
            >
              Choose delivery location
            </h2>

            <p
              className="
                mt-1
                text-[12px]
                font-normal
                leading-[18px]
                text-black/45
              "
            >
              Used to show delivery availability and estimated
              arrival times.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`
              grid h-8 w-8
              shrink-0 place-items-center
              rounded-[5px]
              text-black/45
              transition-colors duration-150
              hover:text-black

              ${FOCUS_RING}
            `}
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5 sm:px-6">
          {/* Current location */}
          {currentLocation && (
            <div
              className="
                flex items-start gap-3
                rounded-[7px]
                border border-black/[0.08]
                bg-[#FAFAFA]
                px-4 py-3.5
              "
            >
              <div
                className="
                  mt-[2px]
                  grid h-8 w-8
                  shrink-0 place-items-center
                  rounded-full
                  bg-brand-50
                  text-brand-700
                "
              >
                <MapPinIcon className="h-4 w-4" />
              </div>

              <div className="min-w-0">
                <p
                  className="
                    text-[9px]
                    font-medium
                    uppercase
                    tracking-[0.1em]
                    text-black/40
                  "
                >
                  Current location
                </p>

                <p
                  className="
                    mt-1 truncate
                    text-[13px]
                    font-medium
                    leading-[18px]
                    text-black
                  "
                >
                  {currentLocation.label}
                </p>

                {currentLocation.details && (
                  <p
                    className="
                      mt-[2px] truncate
                      text-[11px]
                      leading-[16px]
                      text-black/40
                    "
                  >
                    {currentLocation.details}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Device location CTA */}
          <button
            type="button"
            onClick={useCurrentLocation}
            disabled={status === 'locating'}
            className={`
              flex h-[44px] w-full
              items-center justify-center
              gap-2
              rounded-[6px]
              bg-brand-700
              px-4
              text-[12px]
              font-medium
              text-white
              transition-all duration-200

              hover:bg-brand-800
              active:scale-[0.995]

              disabled:cursor-wait
              disabled:opacity-60

              ${FOCUS_RING}
            `}
          >
            <MapPinIcon className="h-[18px] w-[18px]" />

            {status === 'locating'
              ? 'Finding your location…'
              : 'Use my current location'}
          </button>

          {/* Error */}
          {error && (
            <div
              role="alert"
              className="
                rounded-[6px]
                border border-red-200/70
                bg-red-50/60
                px-3.5 py-3
                text-[11px]
                leading-[17px]
                text-red-600
              "
            >
              {error}
            </div>
          )}

          {/* Separator */}
          <div
            className="flex items-center gap-3"
            aria-hidden="true"
          >
            <span className="h-px flex-1 bg-black/[0.08]" />

            <span
              className="
                text-[9px]
                font-medium
                uppercase
                tracking-[0.11em]
                text-black/30
              "
            >
              Or enter manually
            </span>

            <span className="h-px flex-1 bg-black/[0.08]" />
          </div>

          {/* Manual location */}
          <form
            onSubmit={saveManualLocation}
            className="space-y-2.5"
          >
            <label
              htmlFor="manual-delivery-location"
              className="
                block
                text-[11px]
                font-medium
                leading-[17px]
                text-black/75
              "
            >
              City, area, postal code, or address
            </label>

            <div className="flex gap-2">
              <input
                id="manual-delivery-location"
                value={manualLocation}
                onChange={(event) =>
                  setManualLocation(event.target.value)
                }
                maxLength={160}
                autoComplete="street-address"
                placeholder="e.g. Gulberg III, Lahore"
                className={`
                  h-[42px]
                  min-w-0 flex-1
                  rounded-[6px]
                  border border-black/[0.12]
                  bg-white
                  px-3.5
                  text-[12px]
                  text-black
                  outline-none
                  transition-colors

                  placeholder:text-black/30
                  hover:border-black/25
                  focus:border-black/40

                  ${FOCUS_RING}
                `}
              />

              <button
                type="submit"
                className={`
                  h-[42px]
                  shrink-0
                  rounded-[6px]
                  border border-black/[0.12]
                  px-4
                  text-[12px]
                  font-medium
                  text-black
                  transition-colors

                  hover:border-black/25

                  ${FOCUS_RING}
                `}
              >
                Save
              </button>
            </div>
          </form>

          {/* Privacy */}
          <p
            className="
              border-t border-black/[0.06]
              pt-4
              text-[10px]
              leading-[16px]
              text-black/35
            "
          >
            Your delivery location is stored only on this device.
            Browser location is requested only when you choose to
            use it.
          </p>
        </div>
      </div>
    </div>
  );
}