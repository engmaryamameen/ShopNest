import { cookies } from 'next/headers';
import { api } from '@/lib/api';
import { AdminCategoryList } from '@/components/admin/admin-category-list';

export const dynamic = 'force-dynamic';

interface Category {
  id: string;
  name: string;
  slug: string;
}

export default async function AdminCategoriesPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const categories = (await api.listCategories(cookieHeader)) as Category[];

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Categories</h1>
      <AdminCategoryList categories={categories} />
    </div>
  );
}
