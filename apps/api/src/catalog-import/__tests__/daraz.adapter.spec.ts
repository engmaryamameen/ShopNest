import { ConfigService } from '@nestjs/config';
import { DarazAdapter } from '../daraz.adapter';
describe('authorized Daraz seller catalog', () => {
  afterEach(() => jest.restoreAllMocks());
  it('uses actual category names and filters seller pages locally including descendants', async () => {
    const config = new ConfigService({
      app: { darazAppKey: 'key', darazAppSecret: 'secret', darazAccessToken: 'token' },
    });
    const fetch = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: '0',
            data: [
              {
                category_id: 1,
                name: 'Electronics',
                children: [{ category_id: 2, name: 'Headphones' }],
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: '0',
            data: {
              products: [
                {
                  item_id: 5,
                  primary_category: 2,
                  attributes: { name: 'Headphones', brand: 'Sample brand' },
                  images: ['https://img.drz.lazcdn.com/front.jpg'],
                  skus: [{ Images: ['https://img.drz.lazcdn.com/side.jpg'] }],
                },
                { item_id: 6, primary_category: 3, attributes: { name: 'Other item' } },
              ],
            },
          }),
        ),
      );
    const page = await new DarazAdapter(config).fetchProducts({ categories: ['1'], page: 2 });
    expect(page.products).toHaveLength(1);
    expect(page.products[0]).toMatchObject({
      categoryName: 'Headphones',
      imageCount: 2,
      brand: 'Sample brand',
    });
    const request = new URL(String(fetch.mock.calls[1][0]));
    expect(request.searchParams.get('offset')).toBe('50');
    expect(request.searchParams.has('primary_category')).toBe(false);
    expect(request.searchParams.get('sign')).toMatch(/^[A-F0-9]{64}$/);
  });
});
