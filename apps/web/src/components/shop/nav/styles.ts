/** Shared focus-visible treatment for every interactive header element. */
export const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2';

/**
 * Focus treatment for elements flush against an `overflow-hidden` edge
 * (e.g. the two ends of the pill-shaped search bar) — an outset ring with
 * offset would be clipped there, so this draws inward instead.
 */
export const FOCUS_RING_INSET = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-700';

export const linkClassName = `
    relative
    text-[15px]
    font-normal
    text-black
    transition-colors
    duration-200

    after:absolute
    after:-bottom-[6px]
    after:left-0
    after:h-[1.5px]
    after:w-full
    after:origin-left
    after:scale-x-0
    after:rounded-full
    after:bg-black
    after:transition-transform
    after:duration-300
    after:ease-out

    hover:after:scale-x-100
  `;