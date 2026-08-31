import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

const BASE = { name: 'Acme Outdoor Co.', contactEmail: 'sales@acme-outdoor.example' };

describe('ApplyVendorDto — logoUrl origin policy', () => {
  const ORIGINAL_ENV = process.env.MEDIA_PUBLIC_BASE_URL;
  let ApplyVendorDto: typeof import('../apply-vendor.dto').ApplyVendorDto;

  beforeAll(async () => {
    process.env.MEDIA_PUBLIC_BASE_URL = 'https://media.shopnest.example';
    jest.resetModules();
    ({ ApplyVendorDto } = await import('../apply-vendor.dto'));
  });

  afterAll(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.MEDIA_PUBLIC_BASE_URL;
    else process.env.MEDIA_PUBLIC_BASE_URL = ORIGINAL_ENV;
  });

  it('accepts the approved media origin', async () => {
    const dto = plainToInstance(ApplyVendorDto, { ...BASE, logoUrl: 'https://media.shopnest.example/uploads/logo.png' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects an arbitrary public host', async () => {
    const dto = plainToInstance(ApplyVendorDto, { ...BASE, logoUrl: 'https://evil.example/x.png' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'logoUrl')).toBe(true);
  });
});
