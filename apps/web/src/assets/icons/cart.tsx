import type { IconProps } from './types';

export function CartIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M3 4h2.1l2.3 10.4A2 2 0 0 0 9.35 16h7.6a2 2 0 0 0 1.95-1.55L20.5 8H6.2" />
      <circle cx="9.5" cy="20" r="1.35" />
      <circle cx="17.5" cy="20" r="1.35" />
    </svg>
  );
}
