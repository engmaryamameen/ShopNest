import Link from 'next/link';
import { CartIcon } from '@/assets/icons';
import { FOCUS_RING } from './styles';

export function CartLink({ count }: { count: number }) {
  return (
    <Link
      href="/cart"
      aria-label={count > 0 ? `Cart, ${count} item${count === 1 ? '' : 's'}` : 'Cart'}
      className={`relative rounded-xl p-2.5 text-zinc-700 transition-colors ${FOCUS_RING}`}
    >
      <CartIcon className="h-7 w-7" />
      {count > 0 && (
        <span className="absolute right-0 top-0 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent-700 px-1 text-[10px] font-extrabold text-white ring-2 ring-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}
