import type { IconProps } from './types';

/**
 * ShopNest brand glyph — three cradling arcs (the "nest") holding a single
 * dot (the good being carried). Deliberately abstract rather than a literal
 * bag/cart so it reads as a mark, not a stock icon.
 */
export function LogoMark(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" aria-hidden="true" {...props}>
      <path d="M3.5 13.5Q12 21.5 20.5 13.5" />
      <path d="M5.5 11Q12 17.5 18.5 11" opacity={0.82} />
      <path d="M7.5 8.7Q12 13.7 16.5 8.7" opacity={0.64} />
      <circle cx="12" cy="6.3" r="1.55" fill="currentColor" stroke="none" />
    </svg>
  );
}
