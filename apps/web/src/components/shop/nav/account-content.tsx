import { PackageIcon, ShieldCheckIcon, SignOutIcon } from "@/assets/icons";
import { UserIdentity } from "@/store/user.store";
import Link from "next/link";

export function AccountContent({
  currentUser,
  onClose,
  onSignOut,
  mobile = false,
}: {
  currentUser: UserIdentity;
  onClose: () => void;
  onSignOut: () => void;
  mobile?: boolean;
}) {
  return (
    <div className={mobile ? 'px-5 pb-6' : ''}>
      {/* Identity */}
      <div
        className={`
          border-b border-black/[0.07]

          ${mobile ? 'px-0 py-4' : 'px-4 py-3.5'}
        `}
      >
        <p className="text-[10px] font-normal text-black/40">
          Signed in as
        </p>

        <p className="mt-1 truncate text-[13px] font-medium text-black">
          {currentUser.email}
        </p>
      </div>

      {/* Orders */}
      <Link
        href="/orders"
        onClick={onClose}
        className="
          flex min-h-[48px]
          items-center gap-3
          border-b border-black/[0.07]
          text-[13px]
          text-black/75
          lg:px-4 
          transition-colors
          hover:text-black
        "
      >
        <PackageIcon className="h-[18px] w-[18px] text-black/45" />

        Your orders
      </Link>

      {/* Security */}
      <Link
        href="/account/security"
        onClick={onClose}
        className="
          flex min-h-[48px]
          items-center gap-3
          border-b border-black/[0.07]
          text-[13px]
          text-black/75
          lg:px-4
          transition-colors
          hover:text-black
        "
      >
        <ShieldCheckIcon className="h-[18px] w-[18px] text-black/45" />

        Security
      </Link>

      {/* Sign out */}
      <button
        type="button"
        onClick={() => {
          onClose();
          onSignOut();
        }}
        className="
          flex min-h-[48px] w-full
          items-center gap-3
          text-left
          text-[13px]
          lg:px-4 
          text-red-600
        "
      >
        <SignOutIcon className="h-[18px] w-[18px]" />

        Sign out
      </button>
    </div>
  );
}