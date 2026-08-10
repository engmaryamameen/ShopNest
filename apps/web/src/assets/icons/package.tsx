import type { IconProps } from './types';

/** Parcel — used for "Track order". */
export function PackageIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M12 3.5 4 7.25v9.5L12 20.5l8-3.75v-9.5L12 3.5Z" />
      <path d="M4 7.25 12 11l8-3.75M12 11v9.5" />
    </svg>
  );
}
