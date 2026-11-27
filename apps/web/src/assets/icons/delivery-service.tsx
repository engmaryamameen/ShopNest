import type { SVGProps } from 'react';

export function DeliveryServiceIcon(
  props: SVGProps<SVGSVGElement>,
) {
  return (
    <svg
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        opacity="0.3"
        d="M80 40C80 62.0914 62.0914 80 40 80C17.9086 80 0 62.0914 0 40C0 17.9086 17.9086 0 40 0C62.0914 0 80 17.9086 80 40ZM10.9071 40C10.9071 56.0675 23.9325 69.0929 40 69.0929C56.0675 69.0929 69.0929 56.0675 69.0929 40C69.0929 23.9325 56.0675 10.9071 40 10.9071C23.9325 10.9071 10.9071 23.9325 10.9071 40Z"
        fill="#2F2E30"
      />

      <circle cx="40" cy="40" r="29" fill="black" />

      <g clipPath="url(#delivery-service-clip)">
        <path
          d="M31.6667 51.6667C33.5076 51.6667 35 50.1743 35 48.3333C35 46.4924 33.5076 45 31.6667 45C29.8257 45 28.3333 46.4924 28.3333 48.3333C28.3333 50.1743 29.8257 51.6667 31.6667 51.6667Z"
          stroke="#FAFAFA"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <path
          d="M48.3333 51.6667C50.1743 51.6667 51.6667 50.1743 51.6667 48.3333C51.6667 46.4924 50.1743 45 48.3333 45C46.4924 45 45 46.4924 45 48.3333C45 50.1743 46.4924 51.6667 48.3333 51.6667Z"
          stroke="#FAFAFA"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <path
          d="M28.3333 48.3335H27C25.8954 48.3335 25 47.4381 25 46.3335V41.6668M23.3333 28.3335H39.6666C40.7712 28.3335 41.6666 29.2289 41.6666 30.3335V48.3335M35 48.3335H45M41.6666 30.0002H48.8676C49.5701 30.0002 50.2211 30.3688 50.5826 30.9712L55 38.3335V46.3335C55 47.4381 54.1046 48.3335 53 48.3335H51.6667M55 38.3335H41.6666"
          stroke="#FAFAFA"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <path
          d="M25 31.8184H31.6667"
          stroke="#FAFAFA"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <path
          d="M21.8182 35.4546H28.4848"
          stroke="#FAFAFA"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <path
          d="M25 39.0908H31.6667"
          stroke="#FAFAFA"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      <defs>
        <clipPath id="delivery-service-clip">
          <rect
            width="40"
            height="40"
            fill="white"
            transform="translate(20 20)"
          />
        </clipPath>
      </defs>
    </svg>
  );
}