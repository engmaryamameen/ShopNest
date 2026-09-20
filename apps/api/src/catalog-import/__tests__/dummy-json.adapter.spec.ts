import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DummyJsonAdapter } from '../dummy-json.adapter';

describe('DummyJsonAdapter', () => {
  const config = {
    get: jest.fn((key: string) =>
      key === 'app.catalogImportUrl' ? 'https://supplier.test' : 1000,
    ),
  } as unknown as ConfigService;
  const adapter = new DummyJsonAdapter(config);

  afterEach(() => jest.restoreAllMocks());

  it('normalizes supplier money to integer cents', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          products: [
            {
              id: 7,
              title: 'Mechanical Keyboard',
              description: 'A durable mechanical keyboard.',
              category: 'computer-accessories',
              price: 49.95,
              stock: 12,
              thumbnail: 'https://cdn.test/keyboard.jpg',
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await adapter.fetchProducts();
    expect(result.skippedCount).toBe(0);
    expect(result.products).toEqual([
      expect.objectContaining({
        externalId: '7',
        priceCents: 4995,
        stockQuantity: 12,
      }),
    ]);
  });

  it('counts images from the full images[] array, not just the thumbnail', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          products: [
            {
              id: 7,
              title: 'Mechanical Keyboard',
              description: 'A durable mechanical keyboard.',
              category: 'computer-accessories',
              price: 49.95,
              stock: 12,
              thumbnail: 'https://cdn.test/keyboard.jpg',
              images: ['a.jpg', 'b.jpg', 'c.jpg'],
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await adapter.fetchProducts();
    expect(result.products).toEqual([expect.objectContaining({ imageCount: 3 })]);
  });

  it('falls back to imageCount 1 (thumbnail only) or 0 (no image) when images[] is absent', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          products: [
            {
              id: 7,
              title: 'Mechanical Keyboard',
              description: 'A durable mechanical keyboard.',
              category: 'computer-accessories',
              price: 49.95,
              stock: 12,
              thumbnail: 'https://cdn.test/keyboard.jpg',
            },
            {
              id: 8,
              title: 'Blank Notebook',
              description: 'A notebook with no cover image.',
              category: 'stationery',
              price: 4.5,
              stock: 40,
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await adapter.fetchProducts();
    expect(result.products).toEqual([
      expect.objectContaining({ externalId: '7', imageCount: 1 }),
      expect.objectContaining({ externalId: '8', imageCount: 0 }),
    ]);
  });

  it('skips a permanently-invalid product and counts it, without losing the valid ones in the same fetch', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          products: [
            { id: 7, title: 'Broken', price: -1 }, // invalid: negative price, missing description/category/stock
            {
              id: 8,
              title: 'Valid Product',
              description: 'A perfectly valid product.',
              category: 'misc',
              price: 9.99,
              stock: 3,
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await adapter.fetchProducts();
    expect(result.skippedCount).toBe(1);
    expect(result.products).toEqual([expect.objectContaining({ externalId: '8' })]);
  });

  it('still hard-fails the whole fetch on duplicate external ids — a supplier data-integrity problem, not a single bad record', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          products: [
            { id: 7, title: 'First', description: 'A valid description here.', category: 'misc', price: 9.99, stock: 1 },
            { id: 7, title: 'Duplicate', description: 'Another valid description.', category: 'misc', price: 5.0, stock: 2 },
          ],
        }),
        { status: 200 },
      ),
    );

    await expect(adapter.fetchProducts()).rejects.toThrow('duplicate product identifiers');
  });

  it('maps an upstream HTTP failure to a stable gateway error', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 503 }));
    await expect(adapter.fetchProducts()).rejects.toThrow('Catalog supplier returned HTTP 503');
  });

  it('maps a network-level failure to a stable gateway error too', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNRESET'));
    await expect(adapter.fetchProducts()).rejects.toThrow(BadGatewayException);
  });
});
