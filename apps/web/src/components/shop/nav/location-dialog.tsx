'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { CloseIcon, MapPinIcon, SearchIcon } from '@/assets/icons';
import ShopNestLogo from '@/assets/images/logo-shopnest.png';
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

type PermissionState = 'checking' | 'prompt' | 'granted' | 'denied' | 'unsupported';
type Suggestion = { id: string; label: string; details: string };
type Status = 'idle' | 'locating' | 'searching' | 'error';

const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 12_000,
  maximumAge: 300_000,
};

export function LocationDialog({ open, currentLocation, onClose, onSave }: LocationDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRequestRef = useRef(0);
  const [present, setPresent] = useState(open);
  const [visible, setVisible] = useState(false);
  const [permission, setPermission] = useState<PermissionState>('checking');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  useBodyScrollLock(open);
  useEscapeKey(open, onClose);
  useFocusTrap(open, panelRef);

  useEffect(() => {
    if (open) {
      setPresent(true);
      setStatus('idle');
      setError('');
      const frame = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }
    setVisible(false);
    const timer = window.setTimeout(() => setPresent(false), 220);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open || !navigator.permissions) {
      setPermission(navigator.geolocation ? 'prompt' : 'unsupported');
      return;
    }
    let active = true;
    let permissionStatus: PermissionStatus | undefined;
    void navigator.permissions
      .query({ name: 'geolocation' })
      .then((result) => {
        if (!active) return;
        permissionStatus = result;
        const sync = () => setPermission(result.state);
        sync();
        result.onchange = sync;
      })
      .catch(() => setPermission('prompt'));
    return () => {
      active = false;
      if (permissionStatus) permissionStatus.onchange = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 3) {
      setSuggestions([]);
      setStatus('idle');
      return;
    }
    const requestId = ++searchRequestRef.current;
    const timer = window.setTimeout(async () => {
      setStatus('searching');
      setError('');
      try {
        const results = await api.searchLocations(query.trim());
        if (requestId !== searchRequestRef.current) return;
        setSuggestions(results);
        setStatus('idle');
      } catch {
        if (requestId !== searchRequestRef.current) return;
        setSuggestions([]);
        setStatus('error');
        setError('Address search is temporarily unavailable. Please try again.');
      }
    }, 320);
    return () => window.clearTimeout(timer);
  }, [open, query]);

  function useCurrentLocation() {
    setError('');
    if (!navigator.geolocation) {
      setPermission('unsupported');
      setError('Location detection is not supported. Search for your Punjab address below.');
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
            'We found your position but could not resolve the address. Search below instead.',
          );
        }
      },
      (positionError) => {
        setStatus('error');
        if (positionError.code === positionError.PERMISSION_DENIED) {
          setPermission('denied');
          setError(
            'Location is blocked for ShopNest. Allow it from your browser site settings, then click Try location again.',
          );
        } else if (positionError.code === positionError.TIMEOUT) {
          setError('Finding your location took too long. Please try again.');
        } else {
          setError('We could not determine your location. Please try again or search below.');
        }
      },
      GEOLOCATION_OPTIONS,
    );
  }

  function chooseSuggestion(suggestion: Suggestion) {
    onSave({ label: suggestion.label, details: suggestion.details, source: 'manual' });
    onClose();
  }

  if (!present) return null;

  return (
    <div className="fixed font-lato inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close location dialog"
        onClick={onClose}
        data-state={visible ? 'open' : 'closed'}
        className="location-dialog-backdrop absolute inset-0 h-full w-full cursor-pointer bg-black/45 backdrop-blur-[2px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-dialog-title"
        data-state={visible ? 'open' : 'closed'}
        className="location-dialog-panel relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-[0_24px_80px_rgba(0,0,0,.24)] sm:max-w-[520px] sm:rounded-2xl"
      >
        <div className="flex h-5 items-center justify-center sm:hidden">
          <span className="h-1 w-10 rounded-full bg-black/15" />
        </div>
        <header className="flex items-start justify-between border-b border-black/[.07] px-5 pb-5 pt-2 sm:px-7 sm:py-6">
          <div>
            <p>Location</p>
            <h2
              id="location-dialog-title"
              className="text-lg font-semibold tracking-[-.02em] text-neutral-950 sm:text-2xl"
            >
              Where should we deliver?
            </h2>
            <p className="mt-1.5 max-w-[390px] text-[13px] leading-5 text-neutral-500">
              Choose your current location or search for an address in Punjab, Pakistan.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-neutral-500 transition hover:bg-neutral-100 hover:text-black active:scale-95 ${FOCUS_RING}`}
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-5 px-5 py-5 sm:px-7 sm:py-6">
          {currentLocation && (
            <div className="flex items-start gap-3 rounded-xl border border-black/[.08] bg-neutral-50 px-4 py-3.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-neutral-950 text-white">
                <MapPinIcon className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-neutral-400">
                  Delivering to
                </p>
                <p className="mt-1 truncate text-sm font-semibold text-neutral-950">
                  {currentLocation.label}
                </p>
                <p className="mt-0.5 truncate text-xs text-neutral-500">
                  {currentLocation.details}
                </p>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={useCurrentLocation}
            disabled={status === 'locating'}
            className={`flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800 active:scale-[.99] disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`}
          >
            <MapPinIcon className="h-[18px] w-[18px]" />
            {status === 'locating'
              ? 'Finding your location…'
              : permission === 'denied'
                ? 'Try location again'
                : 'Use my current location'}
          </button>

          {permission === 'denied' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-950">
              <p className="font-semibold">Location permission is blocked</p>
              <p className="mt-1">
                Click the site icon beside the address bar, set Location to Allow, then click “Try
                location again.” Chrome will not show the prompt again until you change this
                setting.
              </p>
            </div>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs leading-5 text-red-700"
            >
              {error}
            </p>
          )}

          <div className="flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-black/[.08]" />
            <span className="text-[10px] font-semibold uppercase tracking-[.12em] text-neutral-400">
              or search address
            </span>
            <span className="h-px flex-1 bg-black/[.08]" />
          </div>

          <div>
            <label
              htmlFor="delivery-location-search"
              className="text-xs font-semibold text-neutral-800"
            >
              Address in Punjab, Pakistan
            </label>
            <div className="relative mt-2">
              <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-neutral-400" />
              <input
                id="delivery-location-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                autoComplete="off"
                placeholder="Start typing, e.g. Gulberg III, Lahore"
                className={`h-12 w-full rounded-xl border border-black/[.12] bg-white pl-11 pr-4 text-sm text-neutral-950 outline-none transition placeholder:text-neutral-400 hover:border-black/25}`}
              />
            </div>
            {status === 'searching' && (
              <p className="mt-2 text-xs text-neutral-500">Searching Punjab addresses…</p>
            )}
            {query.trim().length > 0 && query.trim().length < 3 && (
              <p className="mt-2 text-xs text-neutral-500">Enter at least 3 characters.</p>
            )}
            {suggestions.length > 0 && (
              <ul
                className="mt-2 overflow-hidden rounded-xl border border-black/[.09] bg-white shadow-lg"
                role="listbox"
              >
                {suggestions.map((suggestion) => (
                  <li key={suggestion.id}>
                    <button
                      type="button"
                      onClick={() => chooseSuggestion(suggestion)}
                      className={`flex w-full cursor-pointer items-start gap-3 border-b border-black/[.06] px-4 py-3 text-left transition last:border-0 hover:bg-neutral-50 active:bg-neutral-100 ${FOCUS_RING}`}
                    >
                      <MapPinIcon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-neutral-500" />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-neutral-950">
                          {suggestion.label}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-neutral-500">
                          {suggestion.details}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="pt-4 text-[11px] leading-[17px] text-neutral-400">
            Your chosen address is stored only on this device. ShopNest requests browser location
            only after you click the button.
          </p>
        </div>
      </div>
    </div>
  );
}
