import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AdminProductList } from './admin-product-list';
import type { ProductCardResponse } from '@/lib/api-types';

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock('@/lib/api', () => ({
  api: {
    listBrands: jest.fn().mockResolvedValue([]),
    adminProductDetails: jest.fn().mockResolvedValue({ images: [], attributes: [], variants: [] }),
  },
}));
jest.mock('@/components/product/product-description-editor', () => ({
  ProductDescriptionEditor: () => null,
}));
jest.mock('@/components/product/product-description', () => ({ ProductDescription: () => null }));
jest.mock('@/components/shared/offer-pricing-fields', () => ({
  DEFAULT_PRICING: {},
  OfferPricingFields: () => null,
}));
jest.mock('./product-variants-editor', () => ({ ProductVariantsEditor: () => null }));
jest.mock('./product-details-drawer.module.css', () => ({}));
jest.mock('./product-table.module.css', () => ({}));

const product: ProductCardResponse = {
  id: 'test-product',
  name: 'Test product',
  slug: 'test-product',
  description: 'Original description',
  categoryId: 'category',
  category: null,
  brand: null,
  publishStatus: 'DRAFT',
  createdAt: '2026-11-25T00:00:00Z',
  updatedAt: '2026-11-25T00:00:00Z',
  offerId: null,
  priceCents: 999,
  compareAtPriceCents: null,
  stockQuantity: 20,
  imageUrl: null,
  ratingAverage: 0,
  ratingCount: 0,
};

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});

it('preserves the product draft when the image browser is canceled', async () => {
  render(<AdminProductList products={[product]} categories={[]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit Test product' }));
  const editor = screen.getByRole('dialog', { name: 'Edit product' });
  expect(editor).toHaveAccessibleDescription('Test product');
  expect(within(editor).getByText('Test product')).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText('Preparing images…')).not.toBeInTheDocument());
  fireEvent.change(screen.getByLabelText('Product name'), {
    target: { value: 'Unsaved product name' },
  });
  const fileInput = editor.querySelector('input[type="file"]')!;
  fireEvent(fileInput, new Event('cancel', { bubbles: false }));
  expect(editor).not.toHaveAttribute('data-closing');
  expect(editor).toHaveAttribute('open');
  expect(screen.getByLabelText('Product name')).toHaveValue('Unsaved product name');
  // Closing a nested calendar must also leave the parent editor open.
  fireEvent(fileInput, new Event('close', { bubbles: false }));
  expect(screen.getByLabelText('Product name')).toHaveValue('Unsaved product name');
  fireEvent(editor, new Event('cancel', { cancelable: true }));
  expect(editor).toHaveAttribute('data-closing', 'true');
});
