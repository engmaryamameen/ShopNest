import type { IconProps } from './types';

export function MapPinIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 0C5.373 0 0 5.373 0 12c0 5.018 10.005 20.011 12 20 1.964.011 12-15.05 12-20C24 5.373 18.627 0 12 0Zm0 2C17.523 2 22 6.478 22 12c0 4.125-8.363 17.009-10 17-1.663.009-10-12.819-10-17C2 6.478 6.477 2 12 2Zm0 5c-2.761 0-5 2.238-5 5s2.239 5 5 5 5-2.238 5-5-2.239-5-5-5Zm0 2c1.657 0 3 1.343 3 3s-1.343 3-3 3-3-1.343-3-3 1.343-3 3-3Z"
      />
    </svg>
  );
}