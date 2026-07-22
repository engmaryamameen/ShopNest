import { cookies } from 'next/headers';
import { api } from '@/lib/api';
import { AdminProductList } from '@/components/admin/admin-product-list';

export const dynamic = 'force-dynamic';

interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  priceCents: number;
  stockQuantity: number;
  imageUrl?: string | null;
  isActive: boolean;
  category?: { name: string; slug: string };
}

export default async function AdminProductsPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const [products, categories] = await Promise.all([
    api.adminListProducts(cookieHeader) as Promise<Product[]>,
    api.listCategories() as Promise<Array<{ id: string; name: string; slug: string }>>,
  ]);

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Products</h1>
      <AdminProductList products={products} categories={categories} />
    </div>
  );
}
