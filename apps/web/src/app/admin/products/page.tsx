import { cookies } from 'next/headers';
import { api } from '@/lib/api';
import { AdminProductList } from '@/components/admin/admin-product-list';

export const dynamic = 'force-dynamic';

export default async function AdminProductsPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const [products, categories] = await Promise.all([
    api.adminListProducts(cookieHeader),
    api.listCategories(),
  ]);

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Products</h1>
      <AdminProductList products={products} categories={categories} />
    </div>
  );
}
