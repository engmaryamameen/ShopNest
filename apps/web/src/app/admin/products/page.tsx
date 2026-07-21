import { cookies } from 'next/headers';
import { api } from '@/lib/api';
import { AdminProductList } from '@/components/admin/admin-product-list';

export const dynamic = 'force-dynamic';

interface Product {
  id: string;
  name: string;
  slug: string;
  priceCents: number;
  stockQuantity: number;
  isActive: boolean;
  category?: { name: string; slug: string };
}

export default async function AdminProductsPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const result = await api.listProducts({ limit: 100 });
  const categories = (await api.listCategories()) as Array<{ id: string; name: string; slug: string }>;
  const products = (result as { items: Product[] }).items;

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Products</h1>
      <AdminProductList products={products} categories={categories} cookieHeader={cookieHeader} />
    </div>
  );
}
