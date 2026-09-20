import type { IconProps } from './types';

export function SignOutIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M9.5 20.25H6a1.5 1.5 0 0 1-1.5-1.5V5.25A1.5 1.5 0 0 1 6 3.75h3.5" />
      <path d="M15.25 16.5 20 12l-4.75-4.5M9.75 12H20" />
    </svg>
  );
}
