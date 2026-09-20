import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { PromotionsManager } from '@/components/shared/promotions-manager';

export const dynamic = 'force-dynamic';

export default async function VendorPromotionsPage() {
  const cookieHeader = (await cookies()).toString();

  try {
    const vendor = await api.vendorMe(cookieHeader);
    if (vendor.status !== 'APPROVED') redirect('/vendor');
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) redirect('/vendor');
    throw err;
  }

  const promotions = await api.vendorListPromotions(cookieHeader);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Promotions</h1>
      <PromotionsManager promotions={promotions} scope="vendor" />
    </div>
  );
}
