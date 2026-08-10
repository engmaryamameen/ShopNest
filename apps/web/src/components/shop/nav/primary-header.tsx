import { MenuIcon } from '@/assets/icons';
import { BrandLogo } from './brand-logo';
import { SearchBar } from './search-bar';
import { LocationDisplay } from './location-display';
import { AccountMenu } from './account-menu';
import { CartLink } from './cart-link';
import { FOCUS_RING } from './styles';
import type { HeaderCategory } from './types';
import type { UserIdentity } from '@/store/user.store';

interface PrimaryHeaderProps {
  categories: HeaderCategory[];
  currentUser: UserIdentity | null;
  cartCount: number;
  onSignOut: () => void;
  onOpenMenu: () => void;
}

/**
 * The main header row. Layout is one flex container for every viewport:
 * on mobile it wraps onto two lines (icons row, then a full-width search
 * row) via the search bar's `basis-full`; from `lg` up nothing wraps and
 * the search bar instead flexes to fill the space between the logo and
 * the action icons. No absolute positioning or fixed pixel offsets.
 */
export function PrimaryHeader({ categories, currentUser, cartCount, onSignOut, onOpenMenu }: PrimaryHeaderProps) {
  return (
    <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3 py-3 lg:flex-nowrap lg:gap-x-6 lg:py-0 lg:h-[76px]">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open menu"
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-zinc-700 transition-colors hover:bg-zinc-100 lg:hidden ${FOCUS_RING}`}
        >
          <MenuIcon className="h-6 w-6" />
        </button>

        <BrandLogo />

        <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1 lg:order-last lg:ml-0 lg:gap-1.5">
          <LocationDisplay />
          <AccountMenu currentUser={currentUser} onSignOut={onSignOut} />
          <CartLink count={cartCount} />
        </div>

        <SearchBar categories={categories} className="order-last w-full basis-full lg:order-none lg:w-auto lg:basis-auto lg:flex-1" />
      </div>
    </div>
  );
}
