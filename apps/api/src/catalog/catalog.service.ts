import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}


  async createCategory(dto: CreateCategoryDto) {
    return this.prisma.category.create({ data: dto });
  }

  async listCategories() {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
  }


  async createProduct(dto: CreateProductDto) {
    await this.ensureCategoryExists(dto.categoryId);
    return this.prisma.product.create({
      data: dto,
      include: { category: { select: { name: true, slug: true } } },
    });
  }

  async listProducts(query: ProductQueryDto) {
    const { q, category, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    if (q) {
      // Full-text search via the generated tsvector column
      const results = await this.prisma.$queryRaw<Array<{
        id: string; name: string; slug: string; description: string;
        priceCents: number; stockQuantity: number; imageUrl: string | null;
        categoryId: string; isActive: boolean; createdAt: Date; updatedAt: Date;
      }>>`
        SELECT id, name, slug, description, "priceCents", "stockQuantity",
               "imageUrl", "categoryId", "isActive", "createdAt", "updatedAt"
        FROM   "Product"
        WHERE  "isActive" = true
          AND  search_vector @@ plainto_tsquery('english', ${q})
          ${category ? Prisma.sql`AND "categoryId" = (SELECT id FROM "Category" WHERE slug = ${category})` : Prisma.sql``}
        ORDER  BY ts_rank(search_vector, plainto_tsquery('english', ${q})) DESC,
                  "createdAt" DESC
        LIMIT  ${limit} OFFSET ${skip}
      `;
      const total = await this.countSearchResults(q, category);
      return { items: results, total, page, limit };
    }

    const where: Prisma.ProductWhereInput = { isActive: true };
    if (category) {
      const cat = await this.prisma.category.findUnique({ where: { slug: category } });
      if (!cat) return { items: [], total: 0, page, limit };
      where.categoryId = cat.id;
    }

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { category: { select: { name: true, slug: true } } },
      }),
      this.prisma.product.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getProductBySlug(slug: string) {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: { category: { select: { name: true, slug: true } } },
    });
    if (!product || !product.isActive) throw new NotFoundException('Product not found');
    return product;
  }

  async getProductById(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { category: { select: { name: true, slug: true } } },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async updateProduct(id: string, dto: UpdateProductDto) {
    if (dto.categoryId) await this.ensureCategoryExists(dto.categoryId);
    try {
      return await this.prisma.product.update({
        where: { id },
        data: dto,
        include: { category: { select: { name: true, slug: true } } },
      });
    } catch {
      throw new NotFoundException('Product not found');
    }
  }

  async deleteProduct(id: string): Promise<void> {
    try {
      await this.prisma.product.delete({ where: { id } });
    } catch {
      throw new NotFoundException('Product not found');
    }
  }


  private async ensureCategoryExists(categoryId: string): Promise<void> {
    const cat = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!cat) throw new NotFoundException('Category not found');
  }

  private async countSearchResults(q: string, category?: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) AS count
      FROM   "Product"
      WHERE  "isActive" = true
        AND  search_vector @@ plainto_tsquery('english', ${q})
        ${category ? Prisma.sql`AND "categoryId" = (SELECT id FROM "Category" WHERE slug = ${category})` : Prisma.sql``}
    `;
    return Number(rows[0].count);
  }
}
