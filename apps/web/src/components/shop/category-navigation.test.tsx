import { render, screen, within } from '@testing-library/react';
import { CategoryNavigation } from './category-navigation';

const categories = [
  { id: 'fashion', name: 'Fashion & Accessories', slug: 'fashion', parentId: null },
  { id: 'watches', name: 'Watches', slug: 'watches', parentId: 'fashion' },
  { id: 'men', name: 'Men’s Watches', slug: 'mens-watches', parentId: 'watches' },
  { id: 'women', name: 'Women’s Watches', slug: 'womens-watches', parentId: 'watches' },
];
it('offers the watch subcategories while preserving a customer’s search', () => {
  render(<CategoryNavigation categories={categories} selectedSlug="watches" query="watch" />);
  const navigation = within(screen.getByRole('navigation', { name: 'Category navigation' }));
  expect(navigation.getByRole('link', { name: 'Men’s Watches' })).toHaveAttribute(
    'href',
    '/shop?q=watch&category=mens-watches',
  );
  expect(navigation.getByRole('link', { name: 'Women’s Watches' })).toHaveAttribute(
    'href',
    '/shop?q=watch&category=womens-watches',
  );
  expect(navigation.getByRole('link', { name: 'Watches' })).toHaveAttribute('aria-current', 'page');
});
