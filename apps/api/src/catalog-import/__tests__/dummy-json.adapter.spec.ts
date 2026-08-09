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

    await expect(adapter.fetchProducts()).resolves.toEqual([
      expect.objectContaining({
        externalId: '7',
        priceCents: 4995,
        stockQuantity: 12,
      }),
    ]);
  });

  it('rejects a malformed product instead of partially importing it', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          products: [{ id: 7, title: 'Broken', price: -1 }],
        }),
        { status: 200 },
      ),
    );

    await expect(adapter.fetchProducts()).rejects.toThrow(BadGatewayException);
  });

  it('maps an upstream HTTP failure to a stable gateway error', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 503 }));
    await expect(adapter.fetchProducts()).rejects.toThrow('Catalog supplier returned HTTP 503');
  });
});
