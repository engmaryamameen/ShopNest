import { cookies } from 'next/headers';
import { api, ApiError } from '@/lib/api';
import { WriteReviewForm } from './write-review-form';

function ReviewStars({ rating }: { rating: number }) {
  return (
    <div className="flex text-[#ffad33]" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} viewBox="0 0 20 20" aria-hidden="true" className="size-4" fill={i < rating ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.4">
          <path strokeLinecap="round" strokeLinejoin="round" d="m10 1.7 2.55 5.17 5.7.83-4.12 4.02.97 5.68L10 14.72 4.9 17.4l.97-5.68L1.75 7.7l5.7-.83L10 1.7Z" />
        </svg>
      ))}
    </div>
  );
}

export async function ReviewsSection({ slug }: { slug: string }) {
  const cookieHeader = (await cookies()).toString();
  const reviews = await api.listReviews(slug, 1, 20);

  let eligibility: { eligible: boolean; orderItemId: string | null } | null = null;
  try {
    eligibility = await api.reviewEligibility(slug, cookieHeader);
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 401)) throw err;
    // Not logged in — no eligibility to check, form stays hidden.
  }

  return (
    <div className="mt-16 border-t border-gray-200 pt-10">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Reviews</h2>

      {eligibility?.eligible && eligibility.orderItemId && (
        <div className="mb-8">
          <WriteReviewForm slug={slug} orderItemId={eligibility.orderItemId} />
        </div>
      )}

      {reviews.items.length === 0 ? (
        <p className="text-gray-500">No reviews yet.</p>
      ) : (
        <div className="space-y-6">
          {reviews.items.map((review) => (
            <div key={review.id} className="border-b border-gray-100 pb-6 last:border-0">
              <ReviewStars rating={review.rating} />
              {review.title && <h3 className="font-semibold text-gray-900 mt-2">{review.title}</h3>}
              <p className="text-gray-700 mt-1">{review.body}</p>
              <p className="text-xs text-gray-400 mt-2">
                Verified buyer · {new Date(review.createdAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
