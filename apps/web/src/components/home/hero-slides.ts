import type { StaticImageData } from 'next/image';

import fashionImage from '@/assets/images/hero-fashion.webp';
import beautyImage from '@/assets/images/hero-beauty.webp';
import homeImage from '@/assets/images/hero-home.webp';
import outdoorImage from '@/assets/images/hero-outdoor.webp';
import techImage from '@/assets/images/hero-tech.webp';

export interface HeroSlide {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  ctaLabel: string;
  href: string;
  image: StaticImageData;
  imageAlt: string;
  tone: 'charcoal' | 'burgundy' | 'espresso';
}

export const HERO_SLIDES: HeroSlide[] = [
  {
    id: 'tech-essentials',
    eyebrow: 'Tech upgrade event',
    title: 'Future-ready tech. Remarkably within reach.',
    description:
      'Save up to 35% on everyday devices selected for work, play, and everything between.',
    ctaLabel: 'Explore electronics',
    href: '/shop?category=smartphones',
    image: techImage,
    imageAlt: 'A curated collection of modern personal technology',
    tone: 'charcoal',
  },
  {
    id: 'fashion-edit',
    eyebrow: 'The new-season edit',
    title: 'Statement style, made for every day.',
    description:
      'Discover standout accessories and wardrobe staples from emerging marketplace sellers.',
    ctaLabel: 'Shop fashion',
    href: '/shop?category=womens-dresses',
    image: fashionImage,
    imageAlt: 'A premium arrangement of fashion accessories and footwear',
    tone: 'burgundy',
  },
  {
    id: 'home-refresh',
    eyebrow: 'Elevated everyday living',
    title: 'Thoughtful pieces for a home that feels yours.',
    description:
      'Refresh your space with useful, beautifully considered finds from trusted sellers.',
    ctaLabel: 'Explore home',
    href: '/shop?category=home-decoration',
    image: homeImage,
    imageAlt: 'A refined collection of home and lifestyle products',
    tone: 'espresso',
  },
  {
    id: 'beauty-rituals',
    eyebrow: 'Beauty, thoughtfully chosen',
    title: 'Everyday rituals. A little more remarkable.',
    description:
      'Explore skincare, fragrance, and self-care essentials selected from trusted marketplace sellers.',
    ctaLabel: 'Explore beauty',
    href: '/shop?category=beauty',
    image: beautyImage,
    imageAlt: 'A premium collection of skincare and self-care products',
    tone: 'espresso',
  },
  {
    id: 'outdoor-essentials',
    eyebrow: 'Ready for the outdoors',
    title: 'Gear made to take the long way home.',
    description:
      'Find dependable outdoor essentials for weekends, trails, and journeys beyond the everyday.',
    ctaLabel: 'Shop outdoor gear',
    href: '/shop?category=sports-accessories',
    image: outdoorImage,
    imageAlt: 'A premium collection of hiking and outdoor equipment',
    tone: 'charcoal',
  },
];
