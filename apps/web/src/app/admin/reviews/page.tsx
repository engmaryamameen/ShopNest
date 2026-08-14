import { cookies } from 'next/headers';
import { api } from '@/lib/api';
import { ReviewModerationActions } from '@/components/admin/review-moderation-actions';

export const dynamic = 'force-dynamic';

const STATUS_STYLES: Record<string, string> = {
  PUBLISHED: 'bg-green-100 text-green-800',
  HIDDEN: 'bg-gray-100 text-gray-600',
};

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: 'PUBLISHED' | 'HIDDEN' }>;
}) {
  const { page: pageParam, status } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);
  const cookieHeader = (await cookies()).toString();

  const { items, total, limit } = await api.adminListReviews(page, 25, status, cookieHeader);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Reviews</h1>

      <div className="flex gap-2 mb-6 text-sm">
        <a
          href="/admin/reviews"
          className={`px-3 py-1.5 rounded-lg ${!status ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
        >
          All
        </a>
        <a
          href="/admin/reviews?status=PUBLISHED"
          className={`px-3 py-1.5 rounded-lg ${status === 'PUBLISHED' ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
        >
          Published
        </a>
        <a
          href="/admin/reviews?status=HIDDEN"
          className={`px-3 py-1.5 rounded-lg ${status === 'HIDDEN' ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
        >
          Hidden
        </a>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Product</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Rating</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Review</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Author</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Status</th>
              <th className="text-right px-6 py-3 font-medium text-gray-500">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((review) => (
              <tr key={review.id} className="align-top">
                <td className="px-6 py-4 text-gray-900">{review.product?.name}</td>
                <td className="px-6 py-4 text-gray-600">{review.rating}/5</td>
                <td className="px-6 py-4 text-gray-600 max-w-sm">
                  {review.title && <p className="font-medium text-gray-900">{review.title}</p>}
                  <p className="line-clamp-2">{review.body}</p>
                </td>
                <td className="px-6 py-4 text-gray-500">{review.user?.email}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[review.status]}`}>
                    {review.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <ReviewModerationActions id={review.id} status={review.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="text-center text-gray-500 py-12">No reviews found.</p>}
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex justify-center gap-2 text-sm">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <a
              key={p}
              href={`/admin/reviews?page=${p}${status ? `&status=${status}` : ''}`}
              className={`px-3 py-1.5 rounded-lg ${p === page ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              {p}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
