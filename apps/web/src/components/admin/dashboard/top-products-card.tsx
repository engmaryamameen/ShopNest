import { formatPrice } from '@/lib/format-price';
import type { AdminDashboardResponse } from '@/lib/api-types';

export function TopProductsCard({ products }: { products: AdminDashboardResponse['topProducts'] }) {
  return (
    <div className="bg-white rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.2)] p-5">
      <h2 className="font-bold text-admin-heading font-lato mb-3">Top products (last 30 days)</h2>
      {products.length === 0 ? (
        <p className="text-sm text-admin-muted font-lato">No orders in the last 30 days</p>
      ) : (
        <table className="w-full text-sm font-lato">
          <thead>
            <tr className="text-left text-admin-muted">
              <th className="font-normal pb-2">Product</th>
              <th className="font-normal pb-2 text-right">Units sold</th>
              <th className="font-normal pb-2 text-right">Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {products.map((p) => (
              <tr key={p.productSlug}>
                <td className="py-2 text-admin-ink truncate max-w-[220px]">{p.productName}</td>
                <td className="py-2 text-right text-admin-ink font-semibold">{p.unitsSold}</td>
                <td className="py-2 text-right text-admin-muted">{formatPrice(p.averageUnitPriceCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
