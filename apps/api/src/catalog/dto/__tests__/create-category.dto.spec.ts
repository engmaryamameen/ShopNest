import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('CreateCategoryDto — imageUrl origin policy', () => {
  const ORIGINAL_ENV = process.env.MEDIA_PUBLIC_BASE_URL;
  let CreateCategoryDto: typeof import('../create-category.dto').CreateCategoryDto;

  beforeAll(async () => {
    process.env.MEDIA_PUBLIC_BASE_URL = 'https://media.shopnest.example';
    jest.resetModules();
    ({ CreateCategoryDto } = await import('../create-category.dto'));
  });

  afterAll(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.MEDIA_PUBLIC_BASE_URL;
    else process.env.MEDIA_PUBLIC_BASE_URL = ORIGINAL_ENV;
  });

  it('accepts the approved media origin', async () => {
    const dto = plainToInstance(CreateCategoryDto, { name: 'Electronics', imageUrl: 'https://media.shopnest.example/uploads/a.png' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects an arbitrary public host', async () => {
    const dto = plainToInstance(CreateCategoryDto, { name: 'Electronics', imageUrl: 'https://evil.example/x.png' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'imageUrl')).toBe(true);
  });
});
