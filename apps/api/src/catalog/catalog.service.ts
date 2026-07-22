import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
    const slug = dto.slug ?? this.slugify(dto.name);
    const resolved = await this.resolveUniqueSlug(slug, 'category');
    try {
      return await this.prisma.category.create({
        data: { name: dto.name, slug: resolved },
      });
    } catch (err) {
      if (this.isPrismaUniqueViolation(err)) {
        throw new ConflictException('A category with that name already exists');
      }
      throw err;
    }
  }

  async listCategories() {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
  }

  // ---------------------------------------------------------------------------
  // Products
  // ---------------------------------------------------------------------------

  async createProduct(dto: CreateProductDto) {
    await this.ensureCategoryExists(dto.categoryId);
    const slug = dto.slug ?? this.slugify(dto.name);
    const resolved = await this.resolveUniqueSlug(slug, 'product');
    try {
      return await this.prisma.product.create({
        data: { ...dto, slug: resolved },
        include: { category: { select: { name: true, slug: true } } },
      });
    } catch (err) {
      if (this.isPrismaUniqueViolation(err)) {
        throw new ConflictException('A product with that slug already exists');
      }
      throw err;
    }
  }

  async listProducts(query: ProductQueryDto) {
    const { q, category, page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = query;
    const skip = (page - 1) * limit;

    if (q) {
      const orderByClause =
        sortBy === 'priceCents'
          ? Prisma.sql`"priceCents" ${sortOrder === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`}`
          : sortBy === 'name'
            ? Prisma.sql`name ${sortOrder === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`}`
            : Prisma.sql`"createdAt" ${sortOrder === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`}`;

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
                  ${orderByClause}
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
        orderBy: { [sortBy]: sortOrder },
        include: { category: { select: { name: true, slug: true } } },
      }),
      this.prisma.product.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async listAllProducts() {
    return this.prisma.product.findMany({
      orderBy: { createdAt: 'desc' },
      include: { category: { select: { name: true, slug: true } } },
    });
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
    } catch (err) {
      if (this.isPrismaUniqueViolation(err)) {
        throw new ConflictException('A product with that slug already exists');
      }
      throw new NotFoundException('Product not found');
    }
  }

  async archiveProduct(id: string): Promise<void> {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    await this.prisma.product.update({ where: { id }, data: { isActive: false } });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

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

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private async resolveUniqueSlug(base: string, table: 'product' | 'category'): Promise<string> {
    let candidate = base;
    let attempt = 1;
    while (true) {
      const existing =
        table === 'product'
          ? await this.prisma.product.findUnique({ where: { slug: candidate } })
          : await this.prisma.category.findUnique({ where: { slug: candidate } });
      if (!existing) return candidate;
      attempt++;
      candidate = `${base}-${attempt}`;
    }
  }

  private isPrismaUniqueViolation(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    );
  }
}
