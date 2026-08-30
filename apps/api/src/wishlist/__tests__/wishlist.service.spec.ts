import { NotFoundException } from '@nestjs/common';
import { WishlistService } from '../wishlist.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogService } from '../../catalog/catalog.service';

const USER_ID = 'user-1';
const PRODUCT_ID = 'product-1';

function makePrismaMock() {
  return {
    wishlist: { findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
    product: { findUnique: jest.fn() },
  };
}

describe('WishlistService', () => {
  let service: WishlistService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let catalog: { getProductCardsByIds: jest.Mock };

  beforeEach(() => {
    prisma = makePrismaMock();
    catalog = { getProductCardsByIds: jest.fn() };
    service = new WishlistService(prisma as unknown as PrismaService, catalog as unknown as CatalogService);
  });

  describe('add', () => {
    it('404s on a product that does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(service.add(USER_ID, 'missing')).rejects.toThrow(NotFoundException);
    });

    it('upserts — adding an already-saved product is a no-op, not a duplicate or an error', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: PRODUCT_ID });
      await service.add(USER_ID, PRODUCT_ID);
      expect(prisma.wishlist.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId_productId: { userId: USER_ID, productId: PRODUCT_ID } } }),
      );
    });
  });

  describe('list', () => {
    it('preserves wishlist order (most-recently-saved first), not the catalog query order', async () => {
      prisma.wishlist.findMany.mockResolvedValue([{ productId: 'p2' }, { productId: 'p1' }]);
      catalog.getProductCardsByIds.mockResolvedValue([
        { id: 'p1', name: 'First' },
        { id: 'p2', name: 'Second' },
      ]);

      const result = await service.list(USER_ID);

      expect(result.map((r) => r.id)).toEqual(['p2', 'p1']);
    });

    it('drops a saved product id the catalog no longer has a card for, rather than erroring', async () => {
      prisma.wishlist.findMany.mockResolvedValue([{ productId: 'p1' }, { productId: 'deleted-product' }]);
      catalog.getProductCardsByIds.mockResolvedValue([{ id: 'p1', name: 'Still here' }]);

      const result = await service.list(USER_ID);

      expect(result).toHaveLength(1);
    });
  });

  it('remove() is idempotent — removing something not saved is not an error', async () => {
    prisma.wishlist.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.remove(USER_ID, PRODUCT_ID)).resolves.toBeUndefined();
  });
});
