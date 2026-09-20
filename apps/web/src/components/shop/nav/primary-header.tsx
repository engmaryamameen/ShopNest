import { MenuIcon } from '@/assets/icons';

import type { UserIdentity } from '@/store/user.store';

import { AccountMenu } from './account-menu';
import { BrandLogo } from './brand-logo';
import { CartLink } from './cart-link';
import { LocationDisplay } from './location-display';
import { NavMenu } from './nav-menu';
import { SearchBar } from './search-bar';
import { FOCUS_RING } from './styles';
import type { HeaderCategory } from './types';

interface PrimaryHeaderProps {
  categories: HeaderCategory[];
  currentUser: UserIdentity | null;
  cartCount: number;
  onSignOut: () => void;
  onOpenMenu: () => void;
}

export function PrimaryHeader({
  categories,
  currentUser,
  cartCount,
  onSignOut,
  onOpenMenu,
}: PrimaryHeaderProps) {
  return (
    <div className="mx-auto w-full font-lato px-4 sm:px-6 lg:px-6">
      <div
        className="
          flex flex-wrap items-center
          gap-y-3 py-3

          lg:h-[98px]
          lg:flex-nowrap
          lg:gap-x-6
          lg:py-0
        "
      >
        <div className="flex items-center justify-between lg:max-w-[500px] lg:w-full">
          <div className="shrink-0">
            <BrandLogo />
          </div>
          <NavMenu />
        </div>

        <div
          className="
            ml-auto flex shrink-0 items-center gap-1

            lg:order-last
            lg:ml-0
            lg:gap-2
          "
        >
          <LocationDisplay />

          <AccountMenu currentUser={currentUser} onSignOut={onSignOut} />

          <CartLink count={cartCount} />
        </div>

        <div
          className="
            order-last
            flex w-full basis-full
            items-center gap-2
            lg:order-none
            lg:ml-auto
            lg:w-auto
            lg:basis-auto
            lg:flex-1
          "
        >
          {/* Mobile menu */}
          <button
            type="button"
            onClick={onOpenMenu}
            aria-label="Open menu"
            className={`
              grid h-[38px] w-[38px]
              shrink-0 place-items-center
              rounded-[4px]
              bg-[#F5F5F5]
              text-black
              transition-colors
              hover:bg-black/[0.07]

              lg:hidden

              ${FOCUS_RING}
            `}
          >
            <MenuIcon className="h-[18px] w-[18px]" />
          </button>

          {/* Search */}
          <SearchBar
            categories={categories}
            className="
              min-w-0 flex-1

              lg:ml-auto
              lg:max-w-[460px]
            "
          />
        </div>
      </div>
    </div>
  );
}
