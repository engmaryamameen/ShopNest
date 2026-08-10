import { MapPinIcon } from '@/assets/icons';

/**
 * Presentational only — ShopNest has no location picker yet, so this is a
 * static hint rather than a button that would promise an action it can't
 * perform. Space-gated to `xl` where the header has real room for it.
 */
export function LocationDisplay() {
  return (
    <div className="hidden items-center gap-2 px-2.5 py-2 text-zinc-700 xl:flex">
      <MapPinIcon className="h-5 w-5 text-brand-600" />
      <span className="text-left">
        <span className="block text-[10px] font-medium text-zinc-400">Deliver to</span>
        <span className="block max-w-24 truncate text-xs font-bold text-zinc-800">Your location</span>
      </span>
    </div>
  );
}
