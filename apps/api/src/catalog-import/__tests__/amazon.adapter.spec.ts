import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AmazonAdapter } from '../amazon.adapter';

function jsonl(records: unknown[]): string {
  return records.map((r) => JSON.stringify(r)).join('\n') + '\n';
}

describe('AmazonAdapter', () => {
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'app.amazonBaseUrl') return 'https://catalog.test/meta_categories';
      if (key === 'app.amazonPerCategoryLimit') return 100;
      return 20000;
    }),
  } as unknown as ConfigService;
  const adapter = new AmazonAdapter(config);

  afterEach(() => jest.restoreAllMocks());

  /** Streams `records` back for the first category call only — every
   * other scoped category returns an empty file — so a test's fixture
   * list maps to what fetchProducts() sees once, not once per category. */
  function mockFirstCategory(records: unknown[]) {
    let first = true;
    jest.spyOn(global, 'fetch').mockImplementation(async () => {
      const body = first ? jsonl(records) : '';
      first = false;
      return new Response(body, { status: 200 });
    });
  }

  it('normalizes a real record shape — multiple images, real price, brand from store', async () => {
    mockFirstCategory([
      {
        parent_asin: 'B01CUPMQZE',
        title: 'Howard LC0008 Leather Conditioner, 8-Ounce (4-Pack)',
        description: [],
        features: ['Conditions leather', 'For furniture and auto interiors'],
        main_category: 'All Beauty',
        store: 'Howard Products',
        price: 13.99,
        images: [
          { thumb: 'https://img.test/a-thumb.jpg', large: 'https://img.test/a-large.jpg', hi_res: null },
          { thumb: 'https://img.test/b-thumb.jpg', large: 'https://img.test/b-large.jpg', hi_res: 'https://img.test/b-hires.jpg' },
        ],
      },
    ]);

    const result = await adapter.fetchProducts();
    expect(result.skippedCount).toBe(0);
    expect(result.products).toEqual([
      expect.objectContaining({
        externalId: 'B01CUPMQZE',
        name: 'Howard LC0008 Leather Conditioner, 8-Ounce (4-Pack)',
        description: 'Conditions leather For furniture and auto interiors',
        categoryName: 'All Beauty',
        brand: 'Howard Products',
        priceCents: 1399,
        imageUrl: 'https://img.test/a-large.jpg', // no hi_res on this one -> falls back to large
        imageUrls: ['https://img.test/a-large.jpg', 'https://img.test/b-hires.jpg'], // hi_res preferred when present
        imageCount: 2,
      }),
    ]);
    expect(result.products[0].stockQuantity).toBeUndefined(); // never set — static dataset, no inventory
  });

  it('treats a null or zero price as no commercial data, not a real price', async () => {
    mockFirstCategory([
      { parent_asin: '1', title: 'No price', main_category: 'Software', price: null },
      { parent_asin: '2', title: 'Zero price', main_category: 'Software', price: 0 },
    ]);

    const result = await adapter.fetchProducts();
    expect(result.products.every((p) => p.priceCents === undefined)).toBe(true);
  });

  it('falls back to features, then a brand/name sentence, when description is empty', async () => {
    mockFirstCategory([
      { parent_asin: '1', title: 'Widget', main_category: 'Software', store: 'Acme', description: [], features: [] },
    ]);

    const result = await adapter.fetchProducts();
    expect(result.products[0].description).toBe('Widget by Acme.');
  });

  it('skips a record with no parent_asin, no title, or no main_category — and counts it', async () => {
    mockFirstCategory([
      { parent_asin: '', title: 'No id' },
      { parent_asin: '2', title: '' },
      { parent_asin: '3', title: 'No category' },
      { parent_asin: '4', title: 'Valid', main_category: 'Software' },
    ]);

    const result = await adapter.fetchProducts();
    expect(result.skippedCount).toBe(3);
    expect(result.products).toEqual([expect.objectContaining({ externalId: '4' })]);
  });

  it('respects the per-category record limit and stops reading rather than consuming the whole file', async () => {
    const limitedConfig = {
      get: jest.fn((key: string) => {
        if (key === 'app.amazonBaseUrl') return 'https://catalog.test/meta_categories';
        if (key === 'app.amazonPerCategoryLimit') return 3;
        return 20000;
      }),
    } as unknown as ConfigService;
    const limitedAdapter = new AmazonAdapter(limitedConfig);

    const manyRecords = Array.from({ length: 50 }, (_, i) => ({
      parent_asin: `id-${i}`,
      title: `Product ${i}`,
      main_category: 'Software',
    }));
    mockFirstCategory(manyRecords);

    const result = await limitedAdapter.fetchProducts();
    expect(result.products).toHaveLength(3); // not 50 — stopped at the configured limit
  });

  it('one category failing does not sink the whole fetch — the rest still contribute products', async () => {
    let call = 0;
    jest.spyOn(global, 'fetch').mockImplementation(async () => {
      call++;
      if (call === 1) return new Response('', { status: 503 }); // first category fails outright
      if (call === 2) {
        return new Response(jsonl([{ parent_asin: 'ok-1', title: 'Recovered Product', main_category: 'Software' }]), {
          status: 200,
        });
      }
      return new Response('', { status: 200 }); // remaining categories: empty
    });

    const result = await adapter.fetchProducts();
    expect(result.products).toEqual([expect.objectContaining({ externalId: 'ok-1' })]);
  });

  it('maps a total outage (every category fails) to a stable gateway error', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 503 }));
    await expect(adapter.fetchProducts()).rejects.toThrow(BadGatewayException);
  });

  it('maps a network-level outage to a stable gateway error too', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNRESET'));
    await expect(adapter.fetchProducts()).rejects.toThrow(BadGatewayException);
  });
});
