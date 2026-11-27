import { cookies } from 'next/headers';
import { api } from '@/lib/api';
import { PromotionsManager } from '@/components/shared/promotions-manager';

export const dynamic = 'force-dynamic';

export default async function AdminPromotionsPage() {
  const cookieHeader = (await cookies()).toString();
  const promotions = await api.adminListPromotions(cookieHeader);

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Promotions</h1>
      <PromotionsManager promotions={promotions} scope="admin" />
    </div>
  );
}
