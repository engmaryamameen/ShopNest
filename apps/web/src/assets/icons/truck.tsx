import type { IconProps } from './types';

export function TruckIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M2.75 6h10.5v9.5h-10.5z" />
      <path d="M13.25 9.75h3.4l3.6 3.2v2.55h-7z" />
      <circle cx="7" cy="18" r="1.65" />
      <circle cx="17.25" cy="18" r="1.65" />
    </svg>
  );
}
