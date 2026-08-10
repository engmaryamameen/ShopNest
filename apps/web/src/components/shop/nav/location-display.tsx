import { MapPinIcon } from '@/assets/icons';

export function LocationDisplay() {
  return (
    <div className="hidden shrink-0 items-center gap-[6px] xl:flex">
      <MapPinIcon className="h-5 w-5 shrink-0 text-black" />

      <div className="min-w-0 ">
        <p className="text-[9px] font-normal leading-[15px] text-black/50">
          Deliver to
        </p>
        <p className="max-w-[120px] truncate text-[12px] font-medium leading-[18px] text-black">
          Your location
        </p>
      </div>
    </div>
  );
}