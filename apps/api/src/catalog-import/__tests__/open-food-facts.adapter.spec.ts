import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenFoodFactsAdapter } from '../open-food-facts.adapter';

describe('OpenFoodFactsAdapter', () => {
  const config = {
    get: jest.fn((key: string) => (key === 'app.openFoodFactsUrl' ? 'https://off.test' : 100)),
  } as unknown as ConfigService;
  const adapter = new OpenFoodFactsAdapter(config);

  afterEach(() => jest.restoreAllMocks());

  /** The adapter issues one request per scoped grocery category — this
   * returns `products` for the first category call only, and an empty
   * page for every other one, so a test's fixture list maps directly to
   * what fetchProducts() sees once, not once per category. */
  function mockEveryCategory(products: unknown[]) {
    let first = true;
    jest.spyOn(global, 'fetch').mockImplementation(async () => {
      const body = first ? products : [];
      first = false;
      return new Response(JSON.stringify({ products: body }), { status: 200 });
    });
  }

  it('normalizes a record with no commercial data — priceCents/stockQuantity stay undefined', async () => {
    mockEveryCategory([
      {
        code: '5000112637922',
        product_name: 'Sweet Chilli Crisps',
        generic_name: 'Potato crisps with sweet chilli seasoning',
        brands: 'Walkers,PepsiCo',
        image_url: 'https://images.test/crisps.jpg',
        categories_tags: ['en:snacks', 'en:salty-snacks', 'en:crisps'],
      },
    ]);

    const result = await adapter.fetchProducts();
    expect(result.skippedCount).toBe(0);
    expect(result.products).toEqual([
      expect.objectContaining({
        externalId: '5000112637922',
        name: 'Sweet Chilli Crisps',
        description: 'Potato crisps with sweet chilli seasoning',
        brand: 'Walkers',
        categoryName: 'Crisps',
        imageUrl: 'https://images.test/crisps.jpg',
        imageCount: 1,
      }),
    ]);
    expect(result.products[0].priceCents).toBeUndefined();
    expect(result.products[0].stockQuantity).toBeUndefined();
  });

  it('falls back to a brand/name description when generic_name is missing or too short', async () => {
    mockEveryCategory([
      {
        code: '111',
        product_name: 'Oat Bar',
        brands: 'Nature Valley',
        categories_tags: ['en:snacks', 'en:cereal-bars'],
      },
    ]);

    const result = await adapter.fetchProducts();
    expect(result.products[0].description).toBe('Oat Bar by Nature Valley.');
  });

  it('takes the most specific (last) en: category tag', async () => {
    mockEveryCategory([
      { code: '222', product_name: 'Greek Yogurt', categories_tags: ['en:dairies', 'en:fermented-foods', 'en:yogurts'] },
    ]);

    const result = await adapter.fetchProducts();
    expect(result.products[0].categoryName).toBe('Yogurts');
  });

  it('skips a record with no barcode, no name, or no usable category — and counts it', async () => {
    mockEveryCategory([
      { code: '', product_name: 'No barcode' },
      { code: '333', product_name: '' },
      { code: '444', product_name: 'No category tags' },
      { code: '555', product_name: 'Valid Product', categories_tags: ['en:breads'] },
    ]);

    const result = await adapter.fetchProducts();
    expect(result.skippedCount).toBe(3);
    expect(result.products).toEqual([expect.objectContaining({ externalId: '555' })]);
  });

  it('dedupes the same product seen under more than one scoped category', async () => {
    const crossListed = { code: '666', product_name: 'Cross-listed Item', categories_tags: ['en:snacks'] };
    // Same real barcode returned by two different category searches —
    // realistic, since one product can carry more than one category tag.
    // A fresh Response per call: a body can only be read once.
    let call = 0;
    jest.spyOn(global, 'fetch').mockImplementation(async () => {
      const body = call < 2 ? [crossListed] : [];
      call++;
      return new Response(JSON.stringify({ products: body }), { status: 200 });
    });

    const result = await adapter.fetchProducts();
    expect(result.products).toHaveLength(1); // not one per category tag scoped
  });

  // Every category is retried a few times with backoff before being
  // skipped (see fetchCategoryWithRetry) — a total-outage test genuinely
  // takes longer than jest's default per-test timeout to exercise for
  // real, so these two get an explicit longer one rather than mocking the
  // backoff away and losing coverage of the retry path itself.
  it(
    'maps a total upstream outage (every category fails) to a stable gateway error',
    async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 503 }));
      await expect(adapter.fetchProducts()).rejects.toThrow('Catalog supplier is unavailable');
    },
    15000,
  );

  it(
    'maps a total network-level outage to a stable gateway error too',
    async () => {
      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNRESET'));
      await expect(adapter.fetchProducts()).rejects.toThrow(BadGatewayException);
    },
    15000,
  );

  it('retries a single failing category and still returns the rest — one bad category does not sink the whole fetch', async () => {
    let snacksAttempts = 0;
    jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('categories_tags_en=snacks')) {
        snacksAttempts++;
        if (snacksAttempts < 2) return new Response('', { status: 503 });
        return new Response(JSON.stringify({ products: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ products: [] }), { status: 200 });
    });

    const result = await adapter.fetchProducts();
    expect(snacksAttempts).toBeGreaterThanOrEqual(2); // retried, not skipped on the first failure
    expect(result.products).toEqual([]); // no data anywhere, but no thrown error either
  });
});
