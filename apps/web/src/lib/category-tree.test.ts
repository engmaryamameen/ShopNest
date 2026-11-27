import { categoryLineage, categoryOptions, findCategory } from './category-tree';

const categories = [
  { id: 'fashion', name: 'Fashion & Accessories', slug: 'fashion', parentId: null, position: 0 },
  {
    id: 'watches',
    name: 'Watches',
    slug: 'watches',
    parentId: 'fashion',
    position: 1,
    aliases: [{ slug: 'watch' }],
  },
  { id: 'men', name: 'Men’s Watches', slug: 'mens-watches', parentId: 'watches', position: 0 },
  {
    id: 'women',
    name: 'Women’s Watches',
    slug: 'womens-watches',
    parentId: 'watches',
    position: 1,
  },
];

it('keeps parents, descendants and breadcrumbs in a predictable order', () => {
  expect(categoryOptions([...categories].reverse()).map((category) => category.id)).toEqual([
    'fashion',
    'watches',
    'men',
    'women',
  ]);
  expect(categoryOptions(categories).find((category) => category.id === 'men')?.path).toBe(
    'Fashion & Accessories → Watches → Men’s Watches',
  );
  expect(categoryLineage(categories, categories[3]).map((category) => category.id)).toEqual([
    'fashion',
    'watches',
    'women',
  ]);
  expect(findCategory(categories, 'watch')?.id).toBe('watches');
});

it('hides inactive branches and excludes disconnected or cyclic categories from selection', () => {
  const inactive = categories.map((category) =>
    category.id === 'watches' ? { ...category, isActive: false } : category,
  );
  expect(categoryOptions(inactive).map((category) => category.id)).toEqual(['fashion']);
  expect(categoryOptions(inactive, true)).toHaveLength(4);
  expect(
    categoryOptions([{ id: 'cycle', name: 'Cycle', slug: 'cycle', parentId: 'cycle' }]),
  ).toEqual([]);
});
