'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CloseIcon, MapPinIcon } from '@/assets/icons';
import { api } from '@/lib/api';
import { FOCUS_RING } from './styles';
import { useBodyScrollLock } from './use-body-scroll-lock';
import { useEscapeKey } from './use-escape-key';
import { useFocusTrap } from './use-focus-trap';
import type { DeliveryLocation } from './delivery-location';

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

function geolocationMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) {
    return 'Location access was blocked. Allow it in your browser settings or enter your address below.';
  }
  if (error.code === error.TIMEOUT) {
    return 'Finding your location took too long. Please try again or enter it manually.';
  }
  return 'We could not find your location. Please try again or enter it manually.';
}

export function LocationDialog({ open, currentLocation, onClose, onSave }: LocationDialogProps) {
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
      setError('Your browser does not support location detection. Enter your location manually.');
      return;
    }

    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const resolved = await api.reverseGeocode(coords.latitude, coords.longitude);
          onSave({ ...resolved, source: 'device' });
          onClose();
        } catch {
          setStatus('error');
          setError(
            'We found your position but could not identify the area. Enter it manually below.',
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

  function saveManualLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = manualLocation.trim().replace(/\s+/g, ' ');
    if (value.length < 3) {
      setStatus('error');
      setError('Enter a city, area, postal code, or full delivery address.');
      return;
    }

    onSave({ label: value, details: 'Manually selected delivery location', source: 'manual' });
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close location dialog"
        onClick={onClose}
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-dialog-title"
        className="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-[480px] sm:rounded-2xl"
      >
        <div className="flex items-start justify-between border-b border-black/[0.08] px-5 py-5 sm:px-6">
          <div>
            <h2 id="location-dialog-title" className="text-[19px] font-semibold text-ink-900">
              Choose your delivery location
            </h2>
            <p className="mt-1 text-[13px] leading-5 text-black/55">
              We use it to show relevant delivery availability and estimates.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`ml-4 grid h-9 w-9 shrink-0 place-items-center rounded-full text-black/50 hover:bg-black/[0.05] ${FOCUS_RING}`}
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
          {currentLocation && (
            <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-700">
                Current selection
              </p>
              <p className="mt-1 truncate text-[14px] font-semibold text-ink-900">
                {currentLocation.label}
              </p>
              <p className="mt-0.5 truncate text-[12px] text-black/55">{currentLocation.details}</p>
            </div>
          )}

          <button
            type="button"
            onClick={useCurrentLocation}
            disabled={status === 'locating'}
            className={`flex w-full items-center justify-center gap-2.5 rounded-xl bg-brand-700 px-4 py-3.5 text-[14px] font-semibold text-white transition hover:bg-brand-800 disabled:cursor-wait disabled:opacity-70 ${FOCUS_RING}`}
          >
            <MapPinIcon className="h-5 w-5" />
            {status === 'locating' ? 'Detecting your location…' : 'Use my current location'}
          </button>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-[12px] leading-5 text-red-700"
            >
              {error}
            </div>
          )}

          <div className="flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-black/10" />
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-black/35">
              or enter manually
            </span>
            <span className="h-px flex-1 bg-black/10" />
          </div>

          <form onSubmit={saveManualLocation} className="space-y-3">
            <label
              htmlFor="manual-delivery-location"
              className="block text-[13px] font-medium text-ink-900"
            >
              City, area, postal code, or address
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="manual-delivery-location"
                value={manualLocation}
                onChange={(event) => setManualLocation(event.target.value)}
                maxLength={160}
                autoComplete="street-address"
                placeholder="e.g. Gulberg III, Lahore"
                className={`h-11 min-w-0 flex-1 rounded-lg border border-black/15 px-3.5 text-[13px] text-ink-900 placeholder:text-black/35 hover:border-black/30 ${FOCUS_RING}`}
              />
              <button
                type="submit"
                className={`h-11 rounded-lg border border-black/15 px-5 text-[13px] font-semibold text-ink-900 transition hover:bg-black/[0.04] ${FOCUS_RING}`}
              >
                Save
              </button>
            </div>
          </form>

          <p className="text-[11px] leading-4 text-black/40">
            Your selection is saved only on this device. Browser location is requested only when you
            choose to use it.
          </p>
        </div>
      </div>
    </div>
  );
}
