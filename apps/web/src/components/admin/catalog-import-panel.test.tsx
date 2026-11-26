import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CatalogImportPanel } from './catalog-import-panel';
import { ToastProvider } from '@/components/ui/toast';
import { api } from '@/lib/api';
import type {
  CatalogImportRunResponse,
  ImportOptions,
  ImportPreviewResponse,
  PriceQuote,
} from '@/lib/api-types';

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock('./catalog-import-panel.module.css', () => ({}));
jest.mock('./source-category-picker.module.css', () => ({}));
jest.mock('@/components/shared/offer-pricing-fields.module.css', () => ({}));
jest.mock('@/lib/api', () => ({
  api: {
    adminImportOptions: jest.fn(),
    adminImportCategories: jest.fn(),
    adminPreviewImport: jest.fn(),
    adminImportPreviewStatus: jest.fn(),
    adminTriggerImport: jest.fn(),
    priceQuote: jest.fn(),
    taxClasses: jest.fn(),
  },
}));

const options: ImportOptions = {
  sources: [{ id: 'OPEN_FOOD_FACTS', name: 'Open Food Facts', available: true, reason: '' }],
  vendors: [{ id: 'vendor-1', name: 'Test vendor', slug: 'test-vendor' }],
  categories: [],
  taxClasses: [],
  promotions: [],
  brands: [],
  managementVendors: [],
  runs: [],
  sourceFilters: [],
  currency: 'USD',
};
const sample: ImportPreviewResponse['sample'] = [
  {
    externalId: 'test-record',
    name: 'Test preview product',
    categoryName: 'Test category',
    imageCount: 2,
    action: 'create',
  },
];
const ready = {
  status: 'READY',
  previewId: 'saved-preview',
  discoveredCount: 1,
  scopedCount: 1,
  skippedCount: 0,
  wouldCreateCount: 1,
  wouldUpdateCount: 0,
  wouldBeUnchangedCount: 0,
  wouldRejectImageCount: 0,
  sample,
};
const quote: PriceQuote = {
  regularSubtotalCents: 999,
  subtotalCents: 999,
  directDiscountCents: 0,
  automaticDiscountCents: 0,
  couponDiscountCents: 0,
  taxCents: 0,
  netCents: 999,
  shippingCents: 0,
  totalCents: 999,
};
const queuedRun: CatalogImportRunResponse = {
  id: 'import-run',
  source: 'OPEN_FOOD_FACTS',
  status: 'QUEUED',
  scopedCount: 1,
  processedCount: 0,
  createdCount: 0,
  updatedCount: 0,
  unchangedCount: 0,
  discoveredCount: 1,
  skippedCount: 0,
  imagesRejectedCount: 0,
  errorMessage: null,
  categoryScope: [],
  maxRecords: 10,
  minImageCount: 1,
  startedAt: '2026-11-26T10:00:00Z',
  completedAt: null,
};

beforeAll(() => {
  window.matchMedia = jest.fn().mockReturnValue({
    matches: false,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  });
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  HTMLElement.prototype.scrollIntoView = jest.fn();
});
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(api.adminImportOptions).mockResolvedValue(options);
  jest
    .mocked(api.adminImportCategories)
    .mockResolvedValue([{ id: 'en:test', name: 'Test category', parents: [] }]);
  jest
    .mocked(api.adminPreviewImport)
    .mockResolvedValue({ previewId: 'saved-preview', status: 'PREPARING' });
  jest.mocked(api.adminImportPreviewStatus).mockResolvedValue(ready);
  jest.mocked(api.priceQuote).mockResolvedValue(quote);
  jest.mocked(api.taxClasses).mockResolvedValue([]);
  jest.mocked(api.adminTriggerImport).mockResolvedValue(queuedRun);
});
function setup() {
  return render(
    <ToastProvider>
      <CatalogImportPanel />
    </ToastProvider>,
  );
}
async function loaded() {
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Continue to publishing' })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Continue to publishing' }));
}

it('defaults to drafts and sends the original catalog-only scope from one summary action', async () => {
  setup();
  await loaded();
  expect(screen.getByRole('radio', { name: /^Save as drafts/ })).toBeChecked();
  expect(screen.getByRole('radio', { name: /^Create offers & publish/ })).not.toBeChecked();
  expect(screen.queryByRole('heading', { name: 'Vendor assignment' })).not.toBeInTheDocument();
  expect(
    screen.queryByRole('region', { name: 'Estimated customer price' }),
  ).not.toBeInTheDocument();
  expect(
    within(screen.getByRole('complementary', { name: 'Import summary' })).getByRole('button', {
      name: 'Preview products',
    }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Preview products' }));
  await screen.findByRole('button', { name: 'Import 1 draft' });
  expect(api.adminPreviewImport).toHaveBeenCalledWith({
    source: 'OPEN_FOOD_FACTS',
    categoryScope: [],
    maxRecords: 10,
    minImageCount: 1,
    maxImageCount: 3,
    minImageDimension: 0,
    rescan: false,
    targetCategoryId: undefined,
  });
  expect(screen.queryByRole('button', { name: 'Preview products' })).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Import 1 draft' })).toHaveLength(1);
  expect(screen.getByRole('heading', { name: 'Review products' })).toHaveFocus();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select all eligible products' }));
  expect(screen.getByRole('button', { name: 'Import 0 drafts' })).toBeDisabled();
});

it('applies a category override only to the current import', async () => {
  jest
    .mocked(api.adminImportOptions)
    .mockResolvedValue({
      ...options,
      categories: [
        {
          id: 'internal-category',
          name: 'Internal category',
          slug: 'internal-category',
          parentId: null,
          position: 0,
          isActive: true,
          imageUrl: null,
          createdAt: '',
          updatedAt: '',
        },
      ],
    });
  setup();
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'Select products' }));
  fireEvent.click(screen.getByRole('switch', { name: 'Customize import settings' }));
  fireEvent.click(screen.getByRole('button', { name: 'ShopNest category' }));
  fireEvent.click(screen.getByRole('option', { name: 'Internal category' }));
  expect(screen.queryByRole('button', { name: /Save mapping/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Continue to publishing' }));
  fireEvent.click(screen.getByRole('button', { name: 'Preview products' }));
  await screen.findByRole('button', { name: 'Import 1 draft' });
  expect(api.adminPreviewImport).toHaveBeenCalledWith(
    expect.objectContaining({ targetCategoryId: 'internal-category' }),
  );
});

it('keeps the publishing choices exclusive and preserves commercial configuration', async () => {
  setup();
  await loaded();
  fireEvent.click(screen.getByRole('radio', { name: /^Create offers & publish/ }));
  expect(screen.getByRole('radio', { name: /^Save as drafts/ })).not.toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Test vendor' })).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Pricing strategy' }));
  fireEvent.click(screen.getByRole('option', { name: 'Automatic price range' }));
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Regular or minimum price' }), {
    target: { value: '12.50' },
  });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Maximum price' }), {
    target: { value: '18.75' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Inventory strategy' }));
  fireEvent.click(screen.getByRole('option', { name: 'Automatic stock range' }));
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Stock quantity' }), {
    target: { value: '4' },
  });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Maximum stock' }), {
    target: { value: '12' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Tax settings' }));
  fireEvent.click(screen.getByRole('switch', { name: 'Price includes tax' }));
  fireEvent.click(screen.getByRole('button', { name: 'Preview products' }));
  await screen.findByRole('button', { name: 'Import & publish 1 product' });
  expect(api.adminPreviewImport).toHaveBeenCalledWith(
    expect.objectContaining({
      pricingStrategy: 'RANGE',
      vendorIds: ['vendor-1'],
      demoPriceCents: 1250,
      minPriceCents: 1250,
      maxPriceCents: 1875,
      demoStockQuantity: 4,
      minStock: 4,
      maxStock: 12,
      priceIncludesTax: true,
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Publishing' }));
  fireEvent.click(screen.getByRole('radio', { name: /^Save as drafts/ }));
  expect(screen.getByRole('radio', { name: /^Save as drafts/ })).toBeChecked();
  expect(
    screen.queryByRole('button', { name: 'Import & publish 1 product' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('region', { name: 'Estimated customer price' }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio', { name: /^Create offers & publish/ }));
  expect(screen.getByRole('radio', { name: /^Create offers & publish/ })).toBeChecked();
  expect(screen.getByRole('spinbutton', { name: 'Maximum stock' })).toHaveValue(12);
});

it('keeps progressive rows read-only until the complete snapshot is ready', async () => {
  jest.useFakeTimers();
  try {
    jest
      .mocked(api.adminImportPreviewStatus)
      .mockResolvedValueOnce({
        ...ready,
        status: 'PREPARING',
        partialSample: sample,
        progress: { eligible: 1, scanned: 2, requested: 10 },
      })
      .mockResolvedValue(ready);
    setup();
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to publishing' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview products' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(
      within(screen.getByRole('region', { name: 'Product preview table' })).getByText(
        'Test preview product',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select Test preview product' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Import 1 draft' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 of 10 ready · 9 remaining');
    expect(screen.getByRole('status').querySelector('progress')).toHaveAttribute('value', '0.1');
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    expect(screen.getByRole('checkbox', { name: 'Select Test preview product' })).toBeEnabled();
    expect(screen.getAllByRole('button', { name: 'Import 1 draft' })).toHaveLength(1);
  } finally {
    jest.useRealTimers();
  }
});

it('shows a recoverable options error and handles an empty preview', async () => {
  jest.mocked(api.adminImportOptions).mockRejectedValueOnce(new Error('Options unavailable'));
  jest
    .mocked(api.adminImportPreviewStatus)
    .mockResolvedValue({ ...ready, sample: [], wouldCreateCount: 0 });
  setup();
  fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'Preview products' }));
  await screen.findByRole('button', { name: 'Import 0 drafts' });
  expect(screen.getByText(/No new products meet these filters/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Import 0 drafts' })).toBeDisabled();
});

it('validates selection locally, recovers from a preview error and confirms only the reviewed snapshot', async () => {
  jest
    .mocked(api.adminPreviewImport)
    .mockRejectedValueOnce(new Error('Source temporarily unavailable.'));
  setup();
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'Select products' }));
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Product quantity' }), {
    target: { value: '0' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Continue to publishing' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Choose between 1 and 500 new products.',
  );
  expect(api.adminPreviewImport).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Product quantity' }), {
    target: { value: '1' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Continue to publishing' }));
  fireEvent.click(screen.getByRole('button', { name: 'Preview products' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Source temporarily unavailable.');
  fireEvent.click(screen.getByRole('button', { name: 'Preview products' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Import 1 draft' }));
  await waitFor(() => expect(api.adminTriggerImport).toHaveBeenCalledTimes(1));
  const approved = jest.mocked(api.adminPreviewImport).mock.calls[1][0];
  expect(api.adminTriggerImport).toHaveBeenCalledWith({
    ...approved,
    previewId: 'saved-preview',
    selectedProductIds: ['test-record'],
  });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Continue to publishing' })).toHaveFocus(),
  );
  const notification = screen.getByRole('status');
  expect(notification).toHaveTextContent('0 of 1 processed · 1 remaining');
  expect(within(notification).getByRole('link', { name: 'View import history' })).toHaveAttribute(
    'href',
    '/admin/imports?tab=history',
  );
  expect(screen.queryByText('Your import is underway')).not.toBeInTheDocument();
});

it('updates one import notification from server counts through completion, using the selected total', async () => {
  const view = render(
    <ToastProvider>
      <CatalogImportPanel initialOptions={options} runs={[{ ...queuedRun, scopedCount: 5 }]} />
    </ToastProvider>,
  );
  const notification = await screen.findByRole('status');
  expect(notification).toHaveTextContent('0 of 5 processed · 5 remaining');
  view.rerender(
    <ToastProvider>
      <CatalogImportPanel
        initialOptions={options}
        runs={[
          { ...queuedRun, status: 'RUNNING', scopedCount: 5, processedCount: 3, createdCount: 2 },
        ]}
      />
    </ToastProvider>,
  );
  expect(await screen.findByText('3 of 5 processed · 2 remaining')).toBeInTheDocument();
  expect(screen.getByRole('status')).toBe(notification);
  expect(notification.querySelector('progress')).toHaveAttribute('value', '0.6');
  view.rerender(
    <ToastProvider>
      <CatalogImportPanel
        initialOptions={options}
        runs={[
          { ...queuedRun, status: 'SUCCEEDED', scopedCount: 5, processedCount: 5, createdCount: 4 },
        ]}
      />
    </ToastProvider>,
  );
  expect(await screen.findByText('Import complete')).toBeInTheDocument();
  expect(notification).toHaveTextContent('4 imported · 1 skipped');
  expect(notification.querySelector('svg')).toHaveAttribute('data-notification-icon', 'success');
});

it('reports failed imports with accurate remaining counts and does not replay old completed runs', async () => {
  const view = render(
    <ToastProvider>
      <CatalogImportPanel initialOptions={options} runs={[{ ...queuedRun, status: 'SUCCEEDED' }]} />
    </ToastProvider>,
  );
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  view.rerender(
    <ToastProvider>
      <CatalogImportPanel initialOptions={options} runs={[{ ...queuedRun, scopedCount: 5 }]} />
    </ToastProvider>,
  );
  await screen.findByText('Import queued');
  view.rerender(
    <ToastProvider>
      <CatalogImportPanel
        initialOptions={options}
        runs={[
          {
            ...queuedRun,
            status: 'FAILED',
            scopedCount: 5,
            processedCount: 2,
            errorMessage: 'Source unavailable.',
          },
        ]}
      />
    </ToastProvider>,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    '2 of 5 processed · 3 remaining. Source unavailable.',
  );
});

it('invalidates the reviewed snapshot when settings change and requires a fresh review', async () => {
  setup();
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'Preview products' }));
  await screen.findByRole('button', { name: 'Import 1 draft' });
  fireEvent.click(screen.getByRole('button', { name: 'Select products' }));
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Product quantity' }), {
    target: { value: '12' },
  });
  expect(screen.queryByRole('button', { name: 'Import 1 draft' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Review & import' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Continue to publishing' }));
  expect(screen.getByRole('button', { name: 'Preview products' })).toBeEnabled();
});

it('never includes existing products when selecting all eligible preview rows', async () => {
  jest.mocked(api.adminImportPreviewStatus).mockResolvedValue({
    ...ready,
    sample: [
      ...sample,
      {
        ...sample[0],
        externalId: 'existing-record',
        name: 'Existing product',
        action: 'unchanged',
      },
    ],
  });
  setup();
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'Preview products' }));
  await screen.findByRole('button', { name: 'Import 1 draft' });
  expect(screen.getByRole('checkbox', { name: 'Select Existing product' })).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select all eligible products' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select all eligible products' }));
  fireEvent.click(screen.getByRole('button', { name: 'Import 1 draft' }));
  await waitFor(() =>
    expect(api.adminTriggerImport).toHaveBeenCalledWith(
      expect.objectContaining({ selectedProductIds: ['test-record'] }),
    ),
  );
});

it('uses defaults with customization off and restores custom rules when enabled again', async () => {
  jest.mocked(api.adminImportOptions).mockResolvedValue({
    ...options,
    categories: [
      {
        id: 'store-category',
        name: 'Store category',
        slug: 'store-category',
        parentId: null,
        position: 0,
        isActive: true,
        imageUrl: null,
        createdAt: '2026-11-26T00:00:00Z',
        updatedAt: '2026-11-26T00:00:00Z',
      },
    ],
  });
  setup();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Continue to publishing' })).toBeEnabled(),
  );
  const customize = screen.getByRole('switch', { name: 'Customize import settings' });
  expect(customize).not.toBeChecked();
  expect(customize).toHaveAttribute('aria-controls', 'import-custom-settings');
  expect(
    screen.queryByRole('spinbutton', { name: 'Minimum unique images' }),
  ).not.toBeInTheDocument();
  fireEvent.click(customize);
  fireEvent.click(screen.getByRole('button', { name: 'ShopNest category' }));
  fireEvent.click(screen.getByRole('option', { name: 'Store category' }));
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Minimum unique images' }), {
    target: { value: '2' },
  });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Photos per product' }), {
    target: { value: '4' },
  });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Minimum image resolution' }), {
    target: { value: '800' },
  });
  fireEvent.click(screen.getByRole('switch', { name: 'Rescan selected categories' }));
  fireEvent.click(customize);
  expect(
    screen.queryByRole('spinbutton', { name: 'Minimum unique images' }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Continue to publishing' }));
  fireEvent.click(screen.getByRole('button', { name: 'Preview products' }));
  await screen.findByRole('button', { name: 'Import 1 draft' });
  expect(api.adminPreviewImport).toHaveBeenLastCalledWith(
    expect.objectContaining({
      minImageCount: 1,
      maxImageCount: 3,
      minImageDimension: 0,
      rescan: false,
      targetCategoryId: undefined,
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Select products' }));
  fireEvent.click(customize);
  expect(screen.getByRole('spinbutton', { name: 'Minimum unique images' })).toHaveValue(2);
  expect(screen.getByRole('spinbutton', { name: 'Photos per product' })).toHaveValue(4);
  expect(screen.getByRole('switch', { name: 'Rescan selected categories' })).toBeChecked();
  expect(screen.getByRole('button', { name: 'Review & import' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Continue to publishing' }));
  fireEvent.click(screen.getByRole('button', { name: 'Preview products' }));
  await screen.findByRole('button', { name: 'Import 1 draft' });
  expect(api.adminPreviewImport).toHaveBeenLastCalledWith(
    expect.objectContaining({
      minImageCount: 2,
      maxImageCount: 4,
      minImageDimension: 800,
      rescan: true,
      targetCategoryId: 'store-category',
    }),
  );
});

it('distinguishes completed, current and future steps without completing a failed step', async () => {
  jest.mocked(api.adminPreviewImport).mockRejectedValueOnce(new Error('Source unavailable'));
  setup();
  const progress = within(screen.getByRole('list', { name: 'Import progress' }));
  const selection = progress.getByRole('button', { name: 'Select products' });
  const publishing = progress.getByRole('button', { name: 'Publishing' });
  const review = progress.getByRole('button', { name: 'Review & import' });
  expect(selection).toHaveAttribute('aria-current', 'step');
  expect(selection).toHaveAccessibleDescription('In progress');
  expect(publishing).toHaveAccessibleDescription('Next');
  expect(review).toHaveAccessibleDescription('Upcoming');
  await loaded();
  expect(selection).toHaveAccessibleDescription('Completed');
  expect(publishing).toHaveAttribute('aria-current', 'step');
  expect(review).toHaveAccessibleDescription('Next');
  fireEvent.click(screen.getByRole('button', { name: 'Preview products' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Source unavailable');
  expect(publishing).toHaveAttribute('aria-current', 'step');
  expect(review).toHaveAccessibleDescription('Next');
  fireEvent.click(screen.getByRole('button', { name: 'Preview products' }));
  await screen.findByRole('button', { name: 'Import 1 draft' });
  expect(selection).toHaveAccessibleDescription('Completed');
  expect(publishing).toHaveAccessibleDescription('Completed');
  expect(review).toHaveAttribute('aria-current', 'step');
  fireEvent.click(selection);
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Product quantity' }), {
    target: { value: '0' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Continue to publishing' }));
  expect(selection).toHaveAttribute('aria-current', 'step');
  expect(publishing).toHaveAccessibleDescription('Next');
  expect(review).toHaveAccessibleDescription('Upcoming');
  expect(review).toBeDisabled();
});

it('shows repeated validation feedback after the previous toast has expired', async () => {
  jest.useFakeTimers();
  try {
    setup();
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Select products' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Product quantity' }), {
      target: { value: '0' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to publishing' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose between 1 and 500 new products.');
    await act(async () => {
      jest.advanceTimersByTime(6220);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to publishing' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose between 1 and 500 new products.');
    expect(api.adminPreviewImport).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});
