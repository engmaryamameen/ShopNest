import Link from 'next/link';
import  Logo  from '@/assets/images/logo-shopnest.png';
import { FOCUS_RING } from './styles';
import Image from 'next/image';

/** ShopNest wordmark + glyph, shared by the header and the mobile drawer. */
export function BrandLogo() {
  return (
    <Link href="/shop" aria-label="ShopNest home" className={`group flex shrink-0 items-center gap-2.5 rounded-lg ${FOCUS_RING}`}>
      <Image src={Logo} alt='Logo' width={160} height={90} />
    </Link>
  );
}
