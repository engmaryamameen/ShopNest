import { ProductDescription } from '@/components/product/product-description';
import { notFound } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type { ProductDetailResponse } from '@/lib/api-types';
import { StarRating } from '@/components/product/star-rating';
import { OffersList } from '@/components/product/offers-list';
import { ReviewsSection } from '@/components/product/reviews-section';
import { ProductGallery } from '@/components/product/product-gallery';
import { ProductPurchaseOptions } from '@/components/product/product-purchase-options';
export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let product: ProductDetailResponse;
  try {
    product = await api.getProduct(slug);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  return (
    <div className="mx-auto max-w-5xl">
      <div className="grid gap-8 md:grid-cols-2">
        <ProductGallery name={product.name} images={product.images} />
        <div>
          <p className="text-sm font-medium text-[#0077b6]">
            {[product.category?.name, product.brand?.name].filter(Boolean).join(' · ')}
          </p>
          <h1 className="mt-2 text-3xl font-bold text-gray-900">{product.name}</h1>
          <div className="mt-2">
            <StarRating average={product.ratingAverage} count={product.ratingCount} />
          </div>
          <ProductPurchaseOptions product={product} />
          <ProductDescription
            className="mt-6 leading-relaxed text-gray-600"
            value={product.description}
          />
        </div>
      </div>
      {!!product.attributes.length && (
        <section className="mt-10">
          <h2 className="mb-4 text-xl font-semibold text-gray-900">Specifications</h2>
          <dl className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
            {product.attributes.map((a) => (
              <div key={a.slug} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-3">
                <dt className="font-medium text-gray-700">{a.name}</dt>
                <dd className="break-words text-gray-600 sm:col-span-2">{a.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {product.offers.length > 1 && (
        <section className="mt-10">
          <h2 className="mb-4 text-xl font-semibold text-gray-900">Available sellers</h2>
          <OffersList offers={product.offers} productUrl={`/products/${slug}`} />
        </section>
      )}
      {!!product.sourceAttributions?.length && (
        <div className="mt-6 text-xs text-gray-500">
          {product.sourceAttributions.map((a) => (
            <p key={a.url}>
              Product information and images:{' '}
              <a className="underline" href={a.url} target="_blank" rel="noreferrer">
                {a.name}
              </a>{' '}
              · {a.license}
            </p>
          ))}
        </div>
      )}
      <ReviewsSection slug={slug} />
    </div>
  );
}
