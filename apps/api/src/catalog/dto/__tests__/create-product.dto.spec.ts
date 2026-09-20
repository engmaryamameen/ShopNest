import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

const BASE = {
  name: 'Wireless Headphones',
  description: 'High-quality wireless headphones with ANC.',
  priceCents: 9999,
  stockQuantity: 10,
  categoryId: '11111111-1111-4111-8111-111111111111',
};

describe('CreateProductDto — imageUrl origin policy', () => {
  const ORIGINAL_ENV = process.env.MEDIA_PUBLIC_BASE_URL;
  let CreateProductDto: typeof import('../create-product.dto').CreateProductDto;

  beforeAll(async () => {
    process.env.MEDIA_PUBLIC_BASE_URL = 'https://media.shopnest.example';
    jest.resetModules();
    ({ CreateProductDto } = await import('../create-product.dto'));
  });

  afterAll(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.MEDIA_PUBLIC_BASE_URL;
    else process.env.MEDIA_PUBLIC_BASE_URL = ORIGINAL_ENV;
  });

  it('accepts the approved media origin', async () => {
    const dto = plainToInstance(CreateProductDto, { ...BASE, imageUrl: 'https://media.shopnest.example/uploads/a.png' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts omitting imageUrl entirely', async () => {
    const dto = plainToInstance(CreateProductDto, { ...BASE });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects an arbitrary public host', async () => {
    const dto = plainToInstance(CreateProductDto, { ...BASE, imageUrl: 'https://evil.example/x.png' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'imageUrl')).toBe(true);
  });

  it('rejects a private/loopback IP literal', async () => {
    const dto = plainToInstance(CreateProductDto, { ...BASE, imageUrl: 'https://169.254.169.254/latest/meta-data/' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'imageUrl')).toBe(true);
  });

  it('accepts the exact approved Amazon product-image host', async () => {
    const dto = plainToInstance(CreateProductDto, { ...BASE, imageUrl: 'https://m.media-amazon.com/images/I/41qfjSfqNyL.jpg' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects an Amazon lookalike domain', async () => {
    const dto = plainToInstance(CreateProductDto, { ...BASE, imageUrl: 'https://m.media-amazon.com.evil.com/x.jpg' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'imageUrl')).toBe(true);
  });
});
