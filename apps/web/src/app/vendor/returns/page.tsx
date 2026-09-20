import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { ReturnsQueue } from '@/components/shared/returns-queue';

export const dynamic = 'force-dynamic';

export default async function VendorReturnsPage() {
  const cookieHeader = (await cookies()).toString();

  try {
    const vendor = await api.vendorMe(cookieHeader);
    if (vendor.status !== 'APPROVED') redirect('/vendor');
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) redirect('/vendor');
    throw err;
  }

  const returns = await api.vendorListReturns(undefined, cookieHeader);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Returns</h1>
      <ReturnsQueue returns={returns} scope="vendor" />
    </div>
  );
}
