import Link from 'next/link';

import { linkClassName } from './styles';

/** Primary desktop storefront navigation. */
export function NavMenu() {
  return (
    <nav
      aria-label="Primary navigation"
      className="hidden items-center justify-between lg:flex lg:w-[230px]"
    >
      <Link href="/shop" className={linkClassName}>
        Shop
      </Link>

      <Link href="/brands" className={linkClassName}>
        Brands
      </Link>

      <Link href="/specials" className={linkClassName}>
        Specials
      </Link>
    </nav>
  );
}