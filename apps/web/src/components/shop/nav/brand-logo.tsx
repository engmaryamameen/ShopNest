import Link from 'next/link';
import { LogoMark } from '@/assets/icons';
import { FOCUS_RING } from './styles';

/** ShopNest wordmark + glyph, shared by the header and the mobile drawer. */
export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/shop" aria-label="ShopNest home" className={`group flex shrink-0 items-center gap-2.5 rounded-lg ${FOCUS_RING}`}>
      <span
        className={
          'grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-[0_6px_16px_rgba(11,95,72,0.28)] transition-transform duration-200 group-hover:-translate-y-0.5 ' +
          (compact ? 'h-9 w-9' : 'h-10 w-10')
        }
      >
        <LogoMark className={compact ? 'h-5 w-5' : 'h-6 w-6'} />
      </span>
      <span className={'font-extrabold tracking-tight text-ink-900 ' + (compact ? 'text-xl' : 'text-[1.55rem]')}>
        Shop<span className="text-brand-700">Nest</span>
      </span>
    </Link>
  );
}
