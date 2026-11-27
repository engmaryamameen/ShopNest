import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ImportedProductList } from './imported-product-list';
import { ToastProvider } from '@/components/ui/toast';
import { api } from '@/lib/api';
import type { ImportOptions, ProductListResponse } from '@/lib/api-types';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('./import-workspace.module.css', () => ({}));
jest.mock('./admin-product-list', () => ({
  AdminProductList: ({ visibleColumns }: { visibleColumns: string[] }) => (
    <div>Columns: {visibleColumns.join(', ')}</div>
  ),
}));
jest.mock('@/lib/api', () => ({ api: { adminProductPage: jest.fn() } }));
const options: ImportOptions = {
  sources: [{ id: 'OPEN_FOOD_FACTS', name: 'Open Food Facts', available: true, reason: '' }],
  vendors: [],
  categories: [],
  taxClasses: [],
  promotions: [],
  brands: [],
  managementVendors: [],
  runs: [],
  sourceFilters: ['OPEN_FOOD_FACTS'],
  currency: 'USD',
};
const page: ProductListResponse = {
  items: [{ id: 'product-1' } as never],
  total: 1,
  page: 1,
  limit: 25,
};
let client: QueryClient;
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.matchMedia = jest.fn().mockReturnValue({
    matches: false,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  });
});
beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  jest.mocked(api.adminProductPage).mockResolvedValue(page);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => client.clear());
function setup() {
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ImportedProductList initialPage={page} options={options} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

it('keeps source, time and status filtering connected to the server and exposes removable active filters', async () => {
  setup();
  expect(screen.queryByRole('button', { name: 'Source' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  fireEvent.click(screen.getByRole('button', { name: 'Source' }));
  fireEvent.click(screen.getByRole('option', { name: 'Open Food Facts' }));
  await waitFor(() =>
    expect(api.adminProductPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ source: 'OPEN_FOOD_FACTS', importedOnly: 'true', page: 1 }),
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Imported' }));
  fireEvent.click(screen.getByRole('option', { name: 'Last 7 days' }));
  fireEvent.click(screen.getByRole('button', { name: 'Drafts' }));
  await waitFor(() =>
    expect(api.adminProductPage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        source: 'OPEN_FOOD_FACTS',
        since: expect.any(String),
        status: 'DRAFT',
      }),
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Remove source filter' }));
  await waitFor(() =>
    expect(api.adminProductPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ source: '', status: 'DRAFT' }),
    ),
  );
  expect(screen.queryByRole('button', { name: 'Remove source filter' })).not.toBeInTheDocument();
});

it('restores preferences while keeping the product identity column mandatory', async () => {
  localStorage.setItem(
    'shopnest.imported-products.view',
    JSON.stringify({ view: 'table', columns: ['Price'] }),
  );
  setup();
  expect(await screen.findByText('Columns: Product, Price')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Display options' }));
  expect(screen.getByRole('checkbox', { name: 'Product Required' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Product Required' })).toBeDisabled();
});

it('offers recovery when a filtered catalog request fails', async () => {
  setup();
  jest.mocked(api.adminProductPage).mockRejectedValue(new Error('Catalog unavailable'));
  fireEvent.click(screen.getByRole('button', { name: 'Drafts' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Products could not be loaded');
  jest.mocked(api.adminProductPage).mockResolvedValue(page);
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText(/Columns: Product/)).toBeInTheDocument();
});
