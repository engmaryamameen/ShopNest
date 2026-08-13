import Image, { type StaticImageData } from 'next/image';

import beautyImg from '@/assets/images/categories/beauty.png';
import booksImg from '@/assets/images/categories/books.png';
import clothingImg from '@/assets/images/categories/clothing.png';
import electronicsImg from '@/assets/images/categories/electronics.png';
import fragrancesImg from '@/assets/images/categories/fragrance.png';
import furnitureImg from '@/assets/images/categories/furniture.png';
import groceriesImg from '@/assets/images/categories/groceries.png';
import homeDecorationImg from '@/assets/images/categories/home-decoration.png';
import homeGardenImg from '@/assets/images/categories/home_&_garden.png';
import kitchenAccessoriesImg from '@/assets/images/categories/kitchen-accessories.png';
import laptopsImg from '@/assets/images/categories/laptops.png';
import mensShirtsImg from '@/assets/images/categories/mens-shirts.png';
import mensShoesImg from '@/assets/images/categories/mens-shoes.png';
import mensWatchesImg from '@/assets/images/categories/mens-watches.png';
import mobileAccessoriesImg from '@/assets/images/categories/mobile-accessories.png';
import motorcycleImg from '@/assets/images/categories/motorcycle.png';
import skinCareImg from '@/assets/images/categories/skin-care.png';
import smartphonesImg from '@/assets/images/categories/smartphones.png';
import sportsAccessoriesImg from '@/assets/images/categories/sports-accessories.png';
import sunglassesImg from '@/assets/images/categories/sunglasses.png';
import tabletsImg from '@/assets/images/categories/tablets.png';
import topsImg from '@/assets/images/categories/tops.png';
import vehicleImg from '@/assets/images/categories/vehicle.png';
import womensBagsImg from '@/assets/images/categories/womens-bags.png';
import womensDressesImg from '@/assets/images/categories/womens-dresses.png';
import womensJewelleryImg from '@/assets/images/categories/womens-jewellery.png';
import womensShoesImg from '@/assets/images/categories/womens-shoes.png';
import womensWatchesImg from '@/assets/images/categories/womens-watches.png';

type CategoryArtwork = {
  image: StaticImageData;
  scale?: string;
};

const CATEGORY_ARTWORK: Record<string, CategoryArtwork> = {
  beauty: {
    image: beautyImg,
    scale: 'scale-[0.94]',
  },
  books: {
    image: booksImg,
    scale: 'scale-[0.92]',
  },
  clothing: {
    image: clothingImg,
    scale: 'scale-[0.94]',
  },
  electronics: {
    image: electronicsImg,
    scale: 'scale-[0.98]',
  },
  fragrances: {
    image: fragrancesImg,
    scale: 'scale-[0.9]',
  },
  furniture: {
    image: furnitureImg,
    scale: 'scale-[0.92]',
  },
  groceries: {
    image: groceriesImg,
    scale: 'scale-[0.95]',
  },
  'home-decoration': {
    image: homeDecorationImg,
    scale: 'scale-[0.91]',
  },
  'home-garden': {
    image: homeGardenImg,
    scale: 'scale-[0.92]',
  },
  'kitchen-accessories': {
    image: kitchenAccessoriesImg,
    scale: 'scale-[0.94]',
  },
  laptops: {
    image: laptopsImg,
    scale: 'scale-[0.98]',
  },
  'mens-shirts': {
    image: mensShirtsImg,
    scale: 'scale-[0.9]',
  },
  'mens-shoes': {
    image: mensShoesImg,
    scale: 'scale-[0.98]',
  },
  'mens-watches': {
    image: mensWatchesImg,
    scale: 'scale-[0.86]',
  },
  'mobile-accessories': {
    image: mobileAccessoriesImg,
    scale: 'scale-[0.98]',
  },
  motorcycle: {
    image: motorcycleImg,
    scale: 'scale-[1.02]',
  },
  skincare: {
    image: skinCareImg,
    scale: 'scale-[0.94]',
  },
  smartphones: {
    image: smartphonesImg,
    scale: 'scale-[0.91]',
  },
  'sports-accessories': {
    image: sportsAccessoriesImg,
    scale: 'scale-[0.96]',
  },
  sunglasses: {
    image: sunglassesImg,
    scale: 'scale-[0.94]',
  },
  tablets: {
    image: tabletsImg,
    scale: 'scale-[0.94]',
  },
  tops: {
    image: topsImg,
    scale: 'scale-[0.9]',
  },
  vehicle: {
    image: vehicleImg,
    scale: 'scale-[1.02]',
  },
  'womens-bags': {
    image: womensBagsImg,
    scale: 'scale-[0.88]',
  },
  'womens-dresses': {
    image: womensDressesImg,
    scale: 'scale-[0.88]',
  },
  'womens-jewellery': {
    image: womensJewelleryImg,
    scale: 'scale-[0.86]',
  },
  'womens-shoes': {
    image: womensShoesImg,
    scale: 'scale-[0.96]',
  },
  'womens-watches': {
    image: womensWatchesImg,
    scale: 'scale-[0.86]',
  },
};

const CATEGORY_ALIASES: Record<string, keyof typeof CATEGORY_ARTWORK> = {
  beauty: 'beauty',
  book: 'books',
  clothing: 'clothing',
  clothes: 'clothing',
  electronic: 'electronics',
  fragrance: 'fragrances',
  furniture: 'furniture',
  grocery: 'groceries',
  groceries: 'groceries',
  'home-and-garden': 'home-garden',
  'home-decoration': 'home-decoration',
  'home-decor': 'home-decoration',
  'kitchen-accessory': 'kitchen-accessories',
  laptop: 'laptops',
  'men-shirts': 'mens-shirts',
  'men-shoes': 'mens-shoes',
  'men-watches': 'mens-watches',
  'mobile-accessory': 'mobile-accessories',
  motorcycles: 'motorcycle',
  phone: 'smartphones',
  skincare: 'skincare',
  'skin-care': 'skincare',
  smartphone: 'smartphones',
  'sport-accessories': 'sports-accessories',
  sunglass: 'sunglasses',
  tablet: 'tablets',
  top: 'tops',
  vehicles: 'vehicle',
  'women-bags': 'womens-bags',
  'women-dresses': 'womens-dresses',
  'women-jewellery': 'womens-jewellery',
  'women-jewelry': 'womens-jewellery',
  'women-shoes': 'womens-shoes',
  'women-watches': 'womens-watches',
};

function normalizeCategory(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function resolveArtwork(slug: string, name?: string) {
  const candidates = [slug, name]
    .filter((value): value is string => Boolean(value))
    .map(normalizeCategory);

  for (const candidate of candidates) {
    const exactKey =
      CATEGORY_ARTWORK[candidate] ??
      CATEGORY_ARTWORK[CATEGORY_ALIASES[candidate]];

    if (exactKey) {
      return exactKey;
    }
  }

  return null;
}

type CategoryIconProps = {
  slug: string;
  name?: string;
  priority?: boolean;
};

export function CategoryIcon({
  slug,
  name,
  priority = false,
}: CategoryIconProps) {
  const artwork = resolveArtwork(slug, name);

  if (!artwork) {
    return <CategoryImageFallback />;
  }

  return (
    <span className="relative block h-[82px] w-[128px] shrink-0">
      <Image
        src={artwork.image}
        alt=""
        fill
        priority={priority}
        sizes="128px"
        className={[
          'select-none object-contain',
          'transition-transform duration-500 ease-out',
          'group-hover:scale-[1.04]',
          artwork.scale,
        ]
          .filter(Boolean)
          .join(' ')}
      />
    </span>
  );
}

function CategoryImageFallback() {
  return (
    <span
      aria-hidden="true"
      className="grid size-[70px] place-items-center rounded-2xl bg-black/[0.045] text-black/60 transition-colors group-hover:bg-white/15 group-hover:text-white"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z" />
      </svg>
    </span>
  );
}