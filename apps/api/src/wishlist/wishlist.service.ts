import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogService } from '../catalog/catalog.service';

@Injectable()
export class WishlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  async list(userId: string) {
    const items = await this.prisma.wishlist.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { productId: true },
    });
    const cards = await this.catalog.getProductCardsByIds(items.map((i) => i.productId));
    // Preserve wishlist order (most-recently-added first), not whatever
    // order the products query happened to return.
    const bySlug = new Map(cards.map((c) => [c.id, c]));
    return items.map((i) => bySlug.get(i.productId)).filter((c) => c !== undefined);
  }

  async add(userId: string, productId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!product) throw new NotFoundException('Product not found');

    await this.prisma.wishlist.upsert({
      where: { userId_productId: { userId, productId } },
      update: {},
      create: { userId, productId },
    });
    return { status: 'added' as const };
  }

  async remove(userId: string, productId: string): Promise<void> {
    await this.prisma.wishlist.deleteMany({ where: { userId, productId } });
  }
}
