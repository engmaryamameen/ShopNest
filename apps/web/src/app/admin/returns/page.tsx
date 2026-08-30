import { cookies } from 'next/headers';
import { api } from '@/lib/api';
import { ReturnsQueue } from '@/components/shared/returns-queue';

export const dynamic = 'force-dynamic';

export default async function AdminReturnsPage() {
  const cookieHeader = (await cookies()).toString();
  const returns = await api.adminListReturns(undefined, cookieHeader);

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Returns</h1>
      <ReturnsQueue returns={returns} scope="admin" showVendor />
    </div>
  );
}
