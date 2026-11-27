import Link from 'next/link';
import {
  categoryLineage,
  categoryOptions,
  findCategory,
  type CategoryNode,
} from '@/lib/category-tree';

export function CategoryNavigation({
  categories,
  selectedSlug,
  query,
}: {
  categories: CategoryNode[];
  selectedSlug?: string;
  query?: string;
}) {
  const visible = categoryOptions(categories);
  const selected = findCategory(visible, selectedSlug);
  const path = selected ? categoryLineage(visible, selected) : [];
  const children = visible.filter(
    (category) => (category.parentId ?? null) === (selected?.id ?? null),
  );
  const href = (slug?: string) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (slug) params.set('category', slug);
    const search = params.toString();
    return `/shop${search ? '?' + search : ''}`;
  };
  return (
    <nav aria-label="Category navigation" className="mb-6 space-y-3">
      {selected && (
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-600">
          <li>
            <Link href={href()} className="hover:underline">
              All products
            </Link>
          </li>
          {path.map((category) => (
            <li key={category.id} className="flex items-center gap-2">
              <span aria-hidden="true">/</span>
              <Link
                href={href(category.slug)}
                aria-current={category.id === selected.id ? 'page' : undefined}
                className="hover:underline aria-[current=page]:font-semibold aria-[current=page]:text-gray-900"
              >
                {category.name}
              </Link>
            </li>
          ))}
        </ol>
      )}
      {!!children.length && (
        <div className="flex flex-wrap gap-2">
          {children.map((category) => (
            <Link
              key={category.id}
              href={href(category.slug)}
              className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:border-[#0077b6] hover:text-[#0077b6] focus-visible:outline-2 focus-visible:outline-[#0077b6]"
            >
              {category.name}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
