import { PricingController } from './pricing.controller';
import { PrismaService } from '../prisma/prisma.service';
import { PromotionsService } from '../promotions/promotions.service';

describe('pricing preview context', () => {
  it('keeps saved product targeting when optional DTO fields are undefined', async () => {
    const quote = jest.fn().mockResolvedValue({ totalCents: 7920 });
    const prisma = {
      product: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ brandId: 'brand', categoryId: 'category', productType: 'Apparel' }),
      },
    };
    const controller = new PricingController(
      prisma as unknown as PrismaService,
      { quote } as unknown as PromotionsService,
    );
    await controller.quote(
      {
        priceCents: 11000,
        productId: 'product',
        vendorId: 'vendor',
        brandId: undefined,
        categoryId: undefined,
        productType: undefined,
      },
      { sub: 'admin', email: '', role: 'ADMIN', familyId: '' },
    );
    expect(quote).toHaveBeenCalledWith([
      expect.objectContaining({
        productId: 'product',
        vendorId: 'vendor',
        brandId: 'brand',
        categoryId: 'category',
        productType: 'Apparel',
      }),
    ]);
  });

  it('previews unsaved targeting changes and resolves the signed-in vendor', async () => {
    const quote = jest.fn().mockResolvedValue({ totalCents: 100 });
    const prisma = {
      product: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({
            brandId: 'old-brand',
            categoryId: 'old-category',
            productType: 'Apparel',
          }),
      },
      vendorMember: { findFirst: jest.fn().mockResolvedValue({ vendorId: 'own-vendor' }) },
    };
    const controller = new PricingController(
      prisma as unknown as PrismaService,
      { quote } as unknown as PromotionsService,
    );
    await controller.quote(
      {
        priceCents: 100,
        productId: 'product',
        vendorId: 'other-vendor',
        brandId: null,
        categoryId: 'new-category',
        productType: 'Accessories',
      },
      { sub: 'seller', email: '', role: 'VENDOR', familyId: '' },
    );
    expect(quote).toHaveBeenCalledWith([
      expect.objectContaining({
        vendorId: 'own-vendor',
        brandId: null,
        categoryId: 'new-category',
        productType: 'Accessories',
      }),
    ]);
  });
});
