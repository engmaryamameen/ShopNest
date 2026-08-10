import type { IconProps } from './types';

/** Price tag with a percent mark — used for the "Today's deals" entry point. */
export function TagIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M20 12.4 12.6 19.8a1.7 1.7 0 0 1-2.4 0l-6-6a1.7 1.7 0 0 1 0-2.4L11.6 4h6.4a2 2 0 0 1 2 2v6.4Z" />
      <circle cx="15.4" cy="8.6" r="1.15" fill="currentColor" stroke="none" />
    </svg>
  );
}
