import type { IconProps } from './types';

/** Hamburger — opens the mobile navigation drawer. */
export function MenuIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden="true" {...props}>
      <path d="M3.75 6.5h16.5M3.75 12h16.5M3.75 17.5h16.5" />
    </svg>
  );
}
