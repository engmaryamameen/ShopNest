import { cookies } from 'next/headers';
import { api } from '@/lib/api';
import { ImportedProductList } from '@/components/admin/imported-product-list';
import { AdminPageHeader } from '@/components/ui/admin-form';

export const dynamic = 'force-dynamic';

export default async function AdminProductsPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const [products, options] = await Promise.all([
    api.adminProductPage({ importedOnly: 'false' }, cookieHeader),
    api.adminImportOptions(cookieHeader),
  ]);

  return (
    <div>
      <AdminPageHeader
        title="Products"
        description="Manage catalog information, offers, pricing and inventory."
      />
      <ImportedProductList initialPage={products} options={options} importedOnly={false} />
    </div>
  );
}
