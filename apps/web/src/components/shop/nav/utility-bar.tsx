import Link from 'next/link';

/** Slim trust strip above the main header — desktop/laptop only; folded into the mobile drawer below `lg`. */
export function UtilityBar() {
  return (
    <div className=" font-lato hidden bg-[#000000] text-[#FAFAFA] lg:block">
      <div className="mx-auto flex h-8 max-w-[1440px] items-center justify-between px-6 text-[11px] font-medium tracking-wide">
        <p className='text-center mx-auto'>
          Summer Sale For All Swim Suits And Free Express Delivery - OFF 50%!{' '}
          <span>
            <Link href={''} className='font-semibold underline ml-1'>ShopNow</Link>{' '}
          </span>
        </p>
        {/* <div className="flex items-center gap-5">
          <span className="inline-flex items-center gap-1.5 text-zinc-300">
            <ShieldCheckIcon className="h-3.5 w-3.5 text-brand-400" />
            Secure payments
          </span>
          <span className="inline-flex items-center gap-1.5 text-zinc-300">
            <TruckIcon className="h-4 w-4 text-brand-400" />
            Fast delivery
          </span>
          <Link href="/orders" className={`inline-flex items-center gap-1.5 rounded transition-colors hover:text-white ${FOCUS_RING} focus-visible:ring-offset-ink-900`}>
            <PackageIcon className="h-3.5 w-3.5 text-brand-400" />
            Track order
          </Link>
        </div> */}
      </div>
    </div>
  );
}
