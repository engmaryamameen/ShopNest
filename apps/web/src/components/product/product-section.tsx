import Link from 'next/link';

import { ProductCard } from './product-card';
import type { ProductCardData } from './product.types';

interface ProductSectionProps {
  eyebrow: string;
  title: string;
  products: ProductCardData[];
  viewAllHref?: string;
  viewAllLabel?: string;
  emptyMessage?: string;
  showCategory?: boolean;
}

export function ProductSection({
  eyebrow,
  title,
  products,
  viewAllHref,
  viewAllLabel = 'View All Products',
  emptyMessage = 'No products are currently available.',
  showCategory = false,
}: ProductSectionProps) {
  return (
    <section aria-labelledby="product-section-title" className="flex flex-col gap-3 lg:gap-5">
      <div className='flex flex-col gap-1'>
        <div className="flex items-center gap-4">
          <span aria-hidden="true" className="h-10 w-1 rounded bg-[#DB4444]" />
          <p className="text-base font-bold leading-5 text-[#DB4444]">{eyebrow}</p>
        </div>
        <div className="flex items-center justify-between">
          <h2
            id="product-section-title"
            className="text-[clamp(1.75rem,4vw,2rem)] font-bold leading-tight tracking-[0.01em] text-black"
          >
            {title}
          </h2>
          {viewAllHref ? (
            <Link
              href={viewAllHref}
              className="hidden cursor-pointer rounded bg-[#db4444] px-8 py-4 text-sm font-medium text-white transition hover:bg-[#c73e3e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#db4444] focus-visible:ring-offset-2 sm:inline-flex"
            >
              {viewAllLabel}
            </Link>
          ) : null}
        </div>
      </div>

      {products.length > 0 ? (
        <div className="group flex shrink-0 snap-start cursor-pointer items-center justify-center gap-4 overflow-x-scroll">
          {products.map((product, index) => (
            <ProductCard
              key={product.id}
              product={product}
              priority={index < 4}
              showCategory={showCategory}
            />
          ))}
        </div>
      ) : (
        <div className="mt-10 rounded border border-gray-200 bg-gray-50 px-6 py-16 text-center">
          <p className="text-gray-500">{emptyMessage}</p>
        </div>
      )}

      {viewAllHref ? (
        <div className="mt-10 text-center sm:hidden">
          <Link
            href={viewAllHref}
            className="inline-flex cursor-pointer rounded bg-[#db4444] px-8 py-4 text-sm font-medium text-white transition hover:bg-[#c73e3e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#db4444] focus-visible:ring-offset-2"
          >
            {viewAllLabel}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
