import { CATEGORY_REDIRECTS, categoryRedirect } from './category-redirects';
import { offerPricingData, validateOfferPricing } from '../pricing/offer-pricing.dto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PromotionsService } from '../promotions/promotions.service';
import { calculatePrices, PriceInput } from '../pricing/price-calculator';
import { OfferStatus, Prisma } from '@prisma/client';
import sanitizeHtml = require('sanitize-html');
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { SYSTEM_VENDOR_SLUG } from './system-vendor.constants';
import { writeProductSpecifications } from './product-specifications';
import { ProductVariantDto } from './dto/product-variant.dto';
import { AdminProductQueryDto } from './dto/admin-product-query.dto';

const CATEGORY_SELECT = { id: true, name: true, slug: true } satisfies Prisma.CategorySelect;
const BRAND_SELECT = { id: true, name: true, slug: true } satisfies Prisma.BrandSelect;

/** The single ACTIVE offer a listing/detail response prices a product at —
 * "buy box" logic, deliberately simple (lowest price wins; no shipping
 * speed/seller-rating weighting) since nothing in this project's scope
 * needs more. A product with zero ACTIVE offers has nothing to sell and is
 * excluded from storefront results entirely (see the `offers: { some }`
 * filters below), not shown with a blank price. */
const BUY_BOX_OFFER_INCLUDE = {
  offers: {
    where: { status: OfferStatus.ACTIVE, vendor: { status: 'APPROVED' } },
    orderBy: { priceCents: 'asc' as const },
    include: { taxClass: true, vendor: { select: { name: true } } },
  },
  media: { orderBy: { position: 'asc' as const }, take: 1, select: { url: true } },
} satisfies Prisma.ProductInclude;

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly promotions?: PromotionsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Categories — hierarchy: parentId self-relation, cycle prevention on move
  // ---------------------------------------------------------------------------

  async createCategory(dto: CreateCategoryDto) {
    if (dto.parentId) await this.ensureCategoryExists(dto.parentId);
    if (!dto.parentId && dto.isActive !== false && !dto.imageUrl)
      throw new BadRequestException('Main categories need an image. Upload one before saving.');
    const slug = dto.slug ?? this.slugify(dto.name);
    const resolved = await this.resolveUniqueSlug(slug, 'category');
    try {
      return await this.prisma.category.create({
        data: {
          name: dto.name,
          slug: resolved,
          parentId: dto.parentId ?? null,
          position: dto.position ?? 0,
          isActive: dto.isActive ?? true,
          imageUrl: dto.imageUrl,
        },
      });
    } catch (err) {
      if (this.isPrismaUniqueViolation(err)) {
        throw new ConflictException('A category with that name already exists');
      }
      throw err;
    }
  }

  /** Flat list with `parentId` — the frontend/admin assembles the tree
   * client-side (a handful of rows at this project's scale; no reason to
   * pay for recursive-CTE assembly server-side). */
  async listCategories() {
    const categories = await this.prisma.category.findMany({
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
    return categories.map((category) => ({
      ...category,
      aliases: Object.entries(CATEGORY_REDIRECTS)
        .filter(([, target]) => target === category.slug)
        .map(([slug]) => ({ slug })),
    }));
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    // Slug is not auto-derived on rename — it stays stable to preserve existing
    // URLs (e.g. /shop?category=electronics). Pass slug explicitly to change it.
    const data: Prisma.CategoryUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.slug !== undefined) data.slug = dto.slug;
    if (dto.position !== undefined) data.position = dto.position;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.imageUrl !== undefined) {
      data.imageUrl = dto.imageUrl;
      data.imageAttribution = Prisma.DbNull;
    }
    if (dto.slug !== undefined && categoryRedirect(dto.slug))
      throw new ConflictException('That slug is reserved by an existing category link.');

    if (dto.parentId !== undefined) {
      if (dto.parentId === id) {
        throw new BadRequestException('A category cannot be its own parent');
      }
      if (dto.parentId !== null) {
        await this.ensureCategoryExists(dto.parentId);
        if (await this.isDescendantOf(dto.parentId, id)) {
          throw new BadRequestException(
            'Cannot move a category under one of its own descendants — that would create a cycle',
          );
        }
      }
      data.parent = dto.parentId ? { connect: { id: dto.parentId } } : { disconnect: true };
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('At least one field must be provided');
    }

    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Category not found');
    const parentId = dto.parentId === undefined ? existing.parentId : dto.parentId;
    if (
      parentId === null &&
      (dto.isActive ?? existing.isActive) &&
      !(dto.imageUrl === undefined ? existing.imageUrl : dto.imageUrl)
    ) {
      throw new BadRequestException('Main categories need an image. Upload one before saving.');
    }

    try {
      return await this.prisma.category.update({ where: { id }, data });
    } catch (err) {
      if (this.isPrismaUniqueViolation(err)) {
        throw new ConflictException('A category with that slug already exists');
      }
      throw err;
    }
  }

  async deleteCategory(id: string): Promise<void> {
    // Wrap in a transaction so the product/child-category count checks and
    // the delete are atomic — a concurrent product creation or reparent
    // cannot sneak in between them and produce an unhandled FK violation.
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.category.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Category not found');

      const [productCount, childCount] = await Promise.all([
        tx.product.count({ where: { categoryId: id } }),
        tx.category.count({ where: { parentId: id } }),
      ]);

      if (productCount > 0) {
        throw new ConflictException(
          `Cannot delete category: ${productCount} product${productCount === 1 ? '' : 's'} still reference it. Re-assign or archive them first.`,
        );
      }
      if (childCount > 0) {
        throw new ConflictException(
          `Cannot delete category: ${childCount} subcategor${childCount === 1 ? 'y' : 'ies'} still reference it. Move or delete them first.`,
        );
      }
      await tx.category.delete({ where: { id } });
    });
  }

  /** Every id in the subtree rooted at `categoryId`, including itself —
   * "browse Electronics" has to also surface products filed directly under
   * "Laptops" or "Phones" beneath it. Iterative BFS, not a recursive CTE:
   * category trees at this project's scale are a handful of levels deep,
   * so a couple of round trips is simpler than raw recursive SQL for the
   * same result. */
  async getDescendantCategoryIds(categoryId: string): Promise<string[]> {
    const ids = new Set<string>([categoryId]);
    let frontier = [categoryId];

    while (frontier.length > 0) {
      const children = await this.prisma.category.findMany({
        where: { parentId: { in: frontier } },
        select: { id: true },
      });
      const newIds = children.map((c) => c.id).filter((cid) => !ids.has(cid));
      newIds.forEach((cid) => ids.add(cid));
      frontier = newIds;
    }

    return Array.from(ids);
  }

  private async isDescendantOf(candidateId: string, ancestorId: string): Promise<boolean> {
    return (await this.getDescendantCategoryIds(ancestorId)).includes(candidateId);
  }

  // ---------------------------------------------------------------------------
  // Brands — read-only for now; admin CRUD lands with the rest of the admin
  // app. Products can already reference one (Product.brandId).
  // ---------------------------------------------------------------------------

  async listBrands() {
    return this.prisma.brand.findMany({ orderBy: { name: 'asc' } });
  }

  // ---------------------------------------------------------------------------
  // Products — canonical row (Product) + its commercial listing
  // (VendorOffer, under the system vendor for anything admin-authored or
  // imported). Price/stock live exclusively on VendorOffer.
  // ---------------------------------------------------------------------------

  async createProduct(dto: CreateProductDto) {
    try {
      validateOfferPricing(dto);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    if (dto.compareAtPriceCents != null && dto.compareAtPriceCents <= dto.priceCents)
      throw new BadRequestException('The original price must exceed the discounted price');
    await this.ensureCategoryExists(dto.categoryId);
    if (dto.brandId) await this.ensureBrandExists(dto.brandId);
    const slug = dto.slug ?? this.slugify(dto.name);
    const resolved = await this.resolveUniqueSlug(slug, 'product');
    const systemVendorId = await this.getSystemVendorId();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            name: dto.name,
            slug: resolved,
            description: sanitizeHtml(dto.description, { allowedTags: [], allowedAttributes: {} }),
            categoryId: dto.categoryId,
            brandId: dto.brandId ?? null,
            productType: dto.productType,
          },
        });

        const images = dto.imageUrls ?? (dto.imageUrl ? [dto.imageUrl] : []);
        if (dto.specifications)
          await writeProductSpecifications(tx, product.id, dto.specifications);
        if (images.length)
          await tx.productMedia.createMany({
            data: images.map((url, position) => ({ productId: product.id, url, position })),
          });

        const offer = await tx.vendorOffer.create({
          data: {
            ...offerPricingData(dto),
            vendorId: systemVendorId,
            productId: product.id,
            vendorSku: resolved,
            priceCents: dto.priceCents,
            compareAtPriceCents: dto.compareAtPriceCents ?? null,
            stockQuantity: dto.stockQuantity,
            status: OfferStatus.ACTIVE,
          },
        });

        if (dto.stockQuantity > 0) {
          await tx.inventoryAdjustment.create({
            data: {
              vendorOfferId: offer.id,
              delta: dto.stockQuantity,
              reason: 'CORRECTION',
              reference: `admin-create:${product.id}`,
            },
          });
        }

        return this.toProductDetail(await this.loadProductWithOffers(tx, product.id));
      });
    } catch (err) {
      if (this.isPrismaUniqueViolation(err)) {
        throw new ConflictException('A product with that slug already exists');
      }
      throw err;
    }
  }

  async listProducts(query: ProductQueryDto) {
    const {
      q,
      category,
      brand,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;
    const skip = (page - 1) * limit;

    const categoryIds = category ? await this.resolveCategoryFilterIds(category) : null;
    if (category && categoryIds && categoryIds.length === 0) {
      return { items: [], total: 0, page, limit };
    }

    if (q) {
      return this.searchProducts({ q, categoryIds, brand, page, limit, sortBy, sortOrder, skip });
    }

    const where: Prisma.ProductWhereInput = {
      publishStatus: 'PUBLISHED',
      offers: { some: { status: OfferStatus.ACTIVE, vendor: { status: 'APPROVED' } } },
    };
    if (categoryIds) where.categoryId = { in: categoryIds };
    if (brand) where.brand = { slug: brand };

    // Prisma can't order by an aggregate/value of a filtered relation
    // (the buy-box offer's price) declaratively — sort by createdAt at the
    // DB level for that case and re-sort the page in memory afterward.
    // Correct at this project's page sizes (max 100 rows); a raw-SQL sort
    // would be needed if that ever stopped being true.
    const orderBy: Prisma.ProductOrderByWithRelationInput =
      sortBy === 'priceCents' ? { createdAt: 'desc' } : { [sortBy]: sortOrder };

    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          category: { select: CATEGORY_SELECT },
          brand: { select: BRAND_SELECT },
          ...BUY_BOX_OFFER_INCLUDE,
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    let items = (await this.priceProducts(rows)).map((r) => this.toProductCard(r));
    if (sortBy === 'priceCents') {
      items = items.sort((a, b) =>
        sortOrder === 'asc' ? a.priceCents - b.priceCents : b.priceCents - a.priceCents,
      );
    }

    return { items, total, page, limit };
  }

  async listAllProducts() {
    const rows = await this.prisma.product.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        category: { select: CATEGORY_SELECT },
        brand: { select: BRAND_SELECT },
        ...BUY_BOX_OFFER_INCLUDE,
        offers: {
          orderBy: { priceCents: 'asc' },
          include: { taxClass: true, vendor: { select: { name: true } } },
        },
      },
    });
    return rows.map((r) => this.toProductCard(r));
  }

  async adminProductPage(query: AdminProductQueryDto) {
    const clauses: Prisma.Sql[] = [Prisma.sql`TRUE`];
    if (query.q) {
      const term = `%${query.q.replace(/[\\%_]/g, '\\$&')}%`;
      clauses.push(
        Prisma.sql`(p.name ILIKE ${term} OR p.description ILIKE ${term} OR EXISTS (SELECT 1 FROM "Brand" b WHERE b.id = p."brandId" AND b.name ILIKE ${term}))`,
      );
    }
    if (query.status)
      clauses.push(Prisma.sql`p."publishStatus" = ${query.status}::"ProductPublishStatus"`);
    if (query.categoryId)
      clauses.push(
        Prisma.sql`p."categoryId" IN (${Prisma.join((await this.getDescendantCategoryIds(query.categoryId)).map((id) => Prisma.sql`${id}::uuid`))})`,
      );
    if (query.brandId) clauses.push(Prisma.sql`p."brandId" = ${query.brandId}::uuid`);
    if (query.vendorId)
      clauses.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "VendorOffer" o WHERE o."productId" = p.id AND o."vendorId" = ${query.vendorId}::uuid)`,
      );
    if (query.since) clauses.push(Prisma.sql`p."createdAt" >= ${new Date(query.since)}`);
    if (query.importedOnly === 'true' || query.source || query.runId)
      clauses.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "ProductSource" s WHERE s."productId" = p.id ${query.source ? Prisma.sql`AND s.source = ${query.source}::"CatalogSource"` : Prisma.empty} ${query.runId ? Prisma.sql`AND s."importRunId" = ${query.runId}::uuid` : Prisma.empty})`,
      );
    const filter = Prisma.join(clauses, ' AND ');
    const order =
      query.sort === 'name'
        ? Prisma.sql`p.name ASC, p.id`
        : query.sort === 'price'
          ? Prisma.sql`(SELECT MIN(o."priceCents") FROM "VendorOffer" o WHERE o."productId" = p.id) ASC NULLS LAST, p.id`
          : Prisma.sql`p."createdAt" DESC, p.id`;
    const [ids, counts] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{ id: string }>
      >`SELECT p.id FROM "Product" p WHERE ${filter} ORDER BY ${order} LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}`,
      this.prisma.$queryRaw<
        Array<{ count: bigint }>
      >`SELECT COUNT(*) AS count FROM "Product" p WHERE ${filter}`,
    ]);
    const rows = ids.length
      ? await this.prisma.product.findMany({
          where: { id: { in: ids.map((row) => row.id) } },
          include: {
            category: { select: CATEGORY_SELECT },
            brand: { select: BRAND_SELECT },
            ...BUY_BOX_OFFER_INCLUDE,
            offers: {
              orderBy: { priceCents: 'asc' },
              include: { taxClass: true, vendor: { select: { name: true } } },
            },
          },
        })
      : [];
    const cards = new Map(rows.map((row) => [row.id, this.toProductCard(row)]));
    return {
      items: ids.flatMap((row) => {
        const card = cards.get(row.id);
        return card ? [card] : [];
      }),
      total: Number(counts[0].count),
      page: query.page,
      limit: query.limit,
    };
  }

  /** Product cards for a set of ids, in no particular order — for
   * wishlist/recently-viewed style lists that already have their own
   * ordering. */
  async getProductCardsByIds(ids: string[]) {
    if (ids.length === 0) return [];
    const rows = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      include: {
        category: { select: CATEGORY_SELECT },
        brand: { select: BRAND_SELECT },
        ...BUY_BOX_OFFER_INCLUDE,
      },
    });
    return (await this.priceProducts(rows)).map((r) => this.toProductCard(r));
  }

  /** For vendor/admin product pickers — unlike the storefront listing,
   * not filtered by offer existence (the point is finding products with
   * no offer yet). */
  async searchForListing(q: string, limit = 10) {
    const products = await this.prisma.product.findMany({
      where: { publishStatus: 'PUBLISHED', name: { contains: q, mode: 'insensitive' } },
      take: Math.min(Math.max(limit, 1), 25),
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        category: { select: CATEGORY_SELECT },
        variants: {
          select: {
            id: true,
            sku: true,
            attributeValues: { include: { attributeDefinition: { select: { name: true } } } },
          },
        },
      },
    });
    return products.map((product) => ({
      ...product,
      variants: product.variants.map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        label:
          variant.attributeValues
            .map((a) => `${a.attributeDefinition.name}: ${a.value}`)
            .join(' · ') ||
          variant.sku ||
          'Variant',
      })),
    }));
  }

  async getProductBySlug(slug: string) {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: {
        category: { select: CATEGORY_SELECT },
        brand: { select: BRAND_SELECT },
        media: { orderBy: { position: 'asc' } },
        attributeValues: {
          include: { attributeDefinition: { select: { name: true, slug: true } } },
        },
        variants: {
          orderBy: { position: 'asc' },
          include: {
            attributeValues: { include: { attributeDefinition: { select: { name: true } } } },
          },
        },
        sources: { select: { attribution: true } },
        offers: {
          where: { status: OfferStatus.ACTIVE, vendor: { status: 'APPROVED' } },
          orderBy: { priceCents: 'asc' },
          include: { taxClass: true, vendor: { select: { id: true, name: true, slug: true } } },
        },
      },
    });
    if (!product || product.publishStatus !== 'PUBLISHED')
      throw new NotFoundException('Product not found');
    return this.toProductDetail((await this.priceProducts([product]))[0]);
  }

  async getProductById(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: { select: CATEGORY_SELECT },
        brand: { select: BRAND_SELECT },
        ...BUY_BOX_OFFER_INCLUDE,
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    return this.toProductCard(product);
  }

  async getProductImages(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { media: { orderBy: { position: 'asc' }, select: { url: true } } },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product.media.map((image) => image.url);
  }

  async getAdminProductDetails(id: string) {
    const product = await this.prisma.product.findUniqueOrThrow({
      where: { id },
      include: {
        category: { select: CATEGORY_SELECT },
        brand: { select: BRAND_SELECT },
        media: { orderBy: { position: 'asc' } },
        attributeValues: {
          include: { attributeDefinition: { select: { name: true, slug: true } } },
        },
        variants: {
          include: {
            attributeValues: { include: { attributeDefinition: { select: { name: true } } } },
          },
        },
        offers: { include: { vendor: { select: { id: true, name: true, slug: true } } } },
      },
    });
    return this.toProductDetail(product);
  }

  async saveVariant(productId: string, dto: ProductVariantDto, variantId?: string) {
    const entries = Object.entries(dto.attributes);
    if (
      !entries.length ||
      entries.length > 10 ||
      entries.some(
        ([name, value]) =>
          !name.trim() ||
          name.length > 100 ||
          typeof value !== 'string' ||
          !value.trim() ||
          value.length > 200,
      )
    )
      throw new BadRequestException('Provide 1–10 variant attributes, such as Size or Color.');
    try {
      validateOfferPricing(dto);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${productId}::uuid FOR UPDATE`;
      const product = await tx.product.findUniqueOrThrow({ where: { id: productId } });
      const vendorId = dto.vendorId ?? (await this.getSystemVendorId(tx));
      if (!(await tx.vendor.findFirst({ where: { id: vendorId, status: 'APPROVED' } })))
        throw new BadRequestException('Choose an approved vendor.');
      let variant;
      if (variantId) {
        const existing = await tx.productVariant.findFirst({ where: { id: variantId, productId } });
        if (!existing) throw new NotFoundException('Variant not found');
        variant = await tx.productVariant.update({
          where: { id: variantId },
          data: { sku: dto.sku },
        });
        await tx.variantAttributeValue.deleteMany({ where: { variantId } });
      } else {
        const count = await tx.productVariant.count({ where: { productId } });
        variant = await tx.productVariant.create({
          data: { productId, sku: dto.sku, position: count },
        });
        if (!count)
          await tx.vendorOffer.updateMany({
            where: { productId, variantId: null },
            data: { variantId: variant.id },
          });
      }
      for (const [name, value] of entries) {
        const slug = this.slugify(name);
        if (!slug) throw new BadRequestException('Use a readable variant attribute name.');
        const definition = await tx.attributeDefinition.upsert({
          where: { slug },
          update: {},
          create: { name: name.trim(), slug },
        });
        await tx.variantAttributeValue.create({
          data: { variantId: variant.id, attributeDefinitionId: definition.id, value },
        });
      }
      const offer = await tx.vendorOffer.findFirst({
        where: { productId, variantId: variant.id, vendorId },
      });
      if (offer) {
        try {
          validateOfferPricing({ ...offer, ...dto });
        } catch (e) {
          throw new BadRequestException((e as Error).message);
        }
        await tx.vendorOffer.update({
          where: { id: offer.id },
          data: {
            priceCents: dto.priceCents,
            compareAtPriceCents: null,
            stockQuantity: dto.stockQuantity,
            ...offerPricingData(dto),
          },
        });
        const delta = dto.stockQuantity - offer.stockQuantity;
        if (delta)
          await tx.inventoryAdjustment.create({
            data: {
              vendorOfferId: offer.id,
              delta,
              reason: 'CORRECTION',
              reference: `variant:${variant.id}`,
            },
          });
      } else {
        const created = await tx.vendorOffer.create({
          data: {
            productId,
            variantId: variant.id,
            vendorId,
            vendorSku: `variant-${variant.id}`,
            priceCents: dto.priceCents,
            stockQuantity: dto.stockQuantity,
            status: product.publishStatus === 'PUBLISHED' ? 'ACTIVE' : 'DRAFT',
            ...offerPricingData(dto),
          },
        });
        if (dto.stockQuantity)
          await tx.inventoryAdjustment.create({
            data: {
              vendorOfferId: created.id,
              delta: dto.stockQuantity,
              reason: 'RESTOCK',
              reference: `variant:${variant.id}`,
            },
          });
      }
      return variant;
    });
  }

  async updateProduct(id: string, dto: UpdateProductDto) {
    try {
      validateOfferPricing(dto);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    if (
      dto.compareAtPriceCents != null &&
      dto.priceCents !== undefined &&
      dto.compareAtPriceCents <= dto.priceCents
    )
      throw new BadRequestException('The original price must exceed the discounted price');
    if (dto.categoryId) await this.ensureCategoryExists(dto.categoryId);
    if (dto.brandId) await this.ensureBrandExists(dto.brandId);

    const productData: Prisma.ProductUpdateInput = {};
    if (dto.name !== undefined) productData.name = dto.name;
    if (dto.slug !== undefined) productData.slug = dto.slug;
    if (dto.description !== undefined)
      productData.description = sanitizeHtml(dto.description, {
        allowedTags: [],
        allowedAttributes: {},
      });
    if (dto.productType !== undefined) productData.productType = dto.productType;
    if (dto.categoryId !== undefined) productData.category = { connect: { id: dto.categoryId } };
    if (dto.brandId !== undefined)
      productData.brand = dto.brandId ? { connect: { id: dto.brandId } } : { disconnect: true };
    if (dto.isActive !== undefined) {
      productData.publishStatus = dto.isActive ? 'PUBLISHED' : 'ARCHIVED';
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.product.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Product not found');

        if (Object.keys(productData).length > 0) {
          await tx.product.update({ where: { id }, data: productData });
        }

        if (dto.imageUrls !== undefined) {
          await tx.productMedia.deleteMany({ where: { productId: id } });
          if (dto.imageUrls.length)
            await tx.productMedia.createMany({
              data: dto.imageUrls.map((url, position) => ({ productId: id, url, position })),
            });
        }

        if (dto.specifications !== undefined)
          await writeProductSpecifications(tx, id, dto.specifications, true);

        if (
          dto.priceCents !== undefined ||
          dto.stockQuantity !== undefined ||
          dto.compareAtPriceCents !== undefined ||
          Object.keys(offerPricingData(dto)).length
        ) {
          const offerFilter = dto.offerId
            ? { id: dto.offerId, productId: id }
            : { vendorId: await this.getSystemVendorId(tx), productId: id, variantId: null };
          const pricingOffer = await tx.vendorOffer.findFirst({ where: offerFilter });
          if (pricingOffer) {
            try {
              validateOfferPricing({ ...pricingOffer, ...dto });
            } catch (e) {
              throw new BadRequestException((e as Error).message);
            }
          }
          await this.syncSystemVendorOffer(
            tx,
            id,
            dto.priceCents,
            dto.stockQuantity,
            dto.compareAtPriceCents,
            dto.offerId,
            offerPricingData(dto),
          );
        }

        if (dto.isActive === true) {
          const systemVendorId = await this.getSystemVendorId(tx);
          await tx.vendorOffer.updateMany({
            where: {
              productId: id,
              OR: [
                { status: 'DRAFT' },
                { vendorId: systemVendorId },
                { importRunId: { not: null } },
                ...(dto.offerId ? [{ id: dto.offerId }] : []),
              ],
            },
            data: { status: 'ACTIVE' },
          });
        }

        return this.toProductDetail(await this.loadProductWithOffers(tx, id));
      });
    } catch (err) {
      if (this.isPrismaUniqueViolation(err)) {
        throw new ConflictException('A product with that slug already exists');
      }
      if (err instanceof NotFoundException || err instanceof BadRequestException) throw err;
      throw new NotFoundException('Product not found');
    }
  }

  async archiveProduct(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id } });
      if (!product) throw new NotFoundException('Product not found');

      await tx.product.update({ where: { id }, data: { publishStatus: 'ARCHIVED' } });
      // Archiving a product must stop it being purchasable everywhere it's
      // listed, not just under the system vendor — matches "no dead/
      // decorative state": an archived product with a still-ACTIVE offer
      // would keep appearing in results via the offers filter.
      await tx.vendorOffer.updateMany({
        where: { productId: id },
        data: { status: OfferStatus.INACTIVE },
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async resolveCategoryFilterIds(categorySlug: string): Promise<string[] | null> {
    const cat = await this.prisma.category.findUnique({
      where: { slug: categoryRedirect(categorySlug) ?? categorySlug },
    });
    return cat ? this.getDescendantCategoryIds(cat.id) : [];
  }

  private async searchProducts(params: {
    q: string;
    categoryIds: string[] | null;
    brand?: string;
    page: number;
    limit: number;
    sortBy: string;
    sortOrder: 'asc' | 'desc';
    skip: number;
  }) {
    const { q, categoryIds, brand, page, limit, skip, sortBy, sortOrder } = params;
    const direction = sortOrder === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const orderByClause =
      sortBy === 'priceCents'
        ? Prisma.sql`bo."priceCents" ${direction}`
        : sortBy === 'name'
          ? Prisma.sql`p.name ${direction}`
          : Prisma.sql`p."createdAt" ${direction}`;

    const categoryFilter = categoryIds
      ? Prisma.sql`AND p."categoryId" IN (${Prisma.join(categoryIds)})`
      : Prisma.empty;
    const brandFilter = brand ? Prisma.sql`AND b.slug = ${brand}` : Prisma.empty;

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        slug: string;
        description: string;
        categoryId: string;
        createdAt: Date;
        updatedAt: Date;
        categoryName: string;
        categorySlug: string;
        brandName: string | null;
        brandSlug: string | null;
        offerId: string;
        priceCents: number;
        compareAtPriceCents: number | null;
        stockQuantity: number;
        imageUrl: string | null;
        publishStatus: string;
        ratingAverage: number;
        ratingCount: number;
      }>
    >`
      SELECT p.id, p.name, p.slug, p.description, p."categoryId", p."createdAt", p."updatedAt",
             p."publishStatus", p."ratingAverage", p."ratingCount",
             c.name AS "categoryName", c.slug AS "categorySlug",
             b.name AS "brandName", b.slug AS "brandSlug",
             bo.id AS "offerId", bo."priceCents", bo."compareAtPriceCents", bo."stockQuantity",
             (SELECT url FROM "ProductMedia" m WHERE m."productId" = p.id ORDER BY position ASC LIMIT 1) AS "imageUrl"
      FROM   "Product" p
      LEFT   JOIN "Category" c ON c.id = p."categoryId"
      LEFT   JOIN "Brand" b ON b.id = p."brandId"
      JOIN LATERAL (
        SELECT id, "priceCents", "compareAtPriceCents", "stockQuantity"
        FROM   "VendorOffer" o
        WHERE  o."productId" = p.id AND o.status = 'ACTIVE'
        ORDER  BY o."priceCents" ASC
        LIMIT  1
      ) bo ON true
      WHERE  p."publishStatus" = 'PUBLISHED'
        AND  p.search_vector @@ plainto_tsquery('english', ${q})
        ${categoryFilter}
        ${brandFilter}
      ORDER  BY ts_rank(p.search_vector, plainto_tsquery('english', ${q})) DESC,
                ${orderByClause}
      LIMIT  ${limit} OFFSET ${skip}
    `;

    const cards = new Map(
      (await this.getProductCardsByIds(rows.map((row) => row.id))).map((card) => [card.id, card]),
    );
    const items = rows.flatMap((row) => {
      const card = cards.get(row.id);
      return card?.offerId ? [card] : [];
    });

    const total = await this.countSearchResults(q, categoryIds, brand);
    return { items, total, page, limit };
  }

  private async countSearchResults(
    q: string,
    categoryIds: string[] | null,
    brand?: string,
  ): Promise<number> {
    const categoryFilter = categoryIds
      ? Prisma.sql`AND p."categoryId" IN (${Prisma.join(categoryIds)})`
      : Prisma.empty;
    const brandFilter = brand
      ? Prisma.sql`AND EXISTS (SELECT 1 FROM "Brand" b WHERE b.id = p."brandId" AND b.slug = ${brand})`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) AS count
      FROM   "Product" p
      WHERE  p."publishStatus" = 'PUBLISHED'
        AND  p.search_vector @@ plainto_tsquery('english', ${q})
        AND  EXISTS (SELECT 1 FROM "VendorOffer" o WHERE o."productId" = p.id AND o.status = 'ACTIVE')
        ${categoryFilter}
        ${brandFilter}
    `;
    return Number(rows[0].count);
  }

  /** Flattens a Product + buy-box-offer + first-media row into the
   * PLP/card shape (`ProductCardData` on the frontend). `listProducts`
   * filters to only products with an ACTIVE offer before calling this, so
   * `offers[0]` is always present there — `listAllProducts`/`getProductById`
   * (admin) intentionally do *not* filter that way (admin needs to see an
   * archived or offer-less product too), so `offer` can be undefined for
   * those callers; every field below falls back accordingly. */
  private toProductCard(
    product: Prisma.ProductGetPayload<{
      include: typeof BUY_BOX_OFFER_INCLUDE & {
        category: { select: typeof CATEGORY_SELECT };
        brand: { select: typeof BRAND_SELECT };
      };
    }> & { publishStatus: string },
  ) {
    const offer = product.offers[0];
    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      productType: product.productType,
      categoryId: product.categoryId,
      category: product.category,
      brand: product.brand,
      publishStatus: product.publishStatus,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      // The buy-box VendorOffer's own id — this, not the canonical
      // product id, is what a cart line actually keys on. Null if a
      // product has no active offer (admin-only views; the storefront
      // listing filters these out before reaching this mapper).
      offerId: offer?.id ?? null,
      vendorId: offer?.vendorId,
      vendorName: offer?.vendor.name,
      pricingSettings: offer
        ? {
            taxable: offer.taxable,
            priceIncludesTax: offer.priceIncludesTax,
            taxClassId: offer.taxClassId,
            discountEnabled: offer.discountEnabled,
            discountType: offer.discountType,
            discountValue: offer.discountValue,
            discountStartsAt: offer.discountStartsAt,
            discountEndsAt: offer.discountEndsAt,
          }
        : undefined,
      priceCents: offer?.priceCents ?? 0,
      compareAtPriceCents: offer?.compareAtPriceCents ?? null,
      stockQuantity: offer?.stockQuantity ?? 0,
      imageUrl: product.media[0]?.url ?? null,
      ratingAverage: product.ratingAverage,
      ratingCount: product.ratingCount,
    };
  }

  /** PDP shape — includes every active offer (multi-seller display) and
   * specs, not just the buy-box winner. */
  private toProductDetail(product: {
    id: string;
    name: string;
    slug: string;
    description: string;
    categoryId: string;
    createdAt: Date;
    updatedAt: Date;
    ratingAverage: number;
    ratingCount: number;
    category: { id: string; name: string; slug: string };
    brand: { id: string; name: string; slug: string } | null;
    media: Array<{ url: string; position: number; altText: string | null }>;
    attributeValues?: Array<{ value: string; attributeDefinition: { name: string; slug: string } }>;
    sources?: Array<{ attribution: Prisma.JsonValue }>;
    variants?: Array<{
      id: string;
      sku: string | null;
      attributeValues: Array<{ value: string; attributeDefinition: { name: string } }>;
    }>;
    offers: Array<{
      id: string;
      priceCents: number;
      compareAtPriceCents: number | null;
      stockQuantity: number;
      variantId?: string | null;
      condition: string;
      vendor: { id: string; name: string; slug: string };
    }>;
  }) {
    const cheapest =
      [...product.offers].sort(
        (a, b) =>
          Number(b.stockQuantity > 0) - Number(a.stockQuantity > 0) || a.priceCents - b.priceCents,
      )[0] ?? null;
    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      categoryId: product.categoryId,
      category: product.category,
      brand: product.brand,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      images: product.media.map((m) => ({ url: m.url, altText: m.altText })),
      imageUrl: product.media[0]?.url ?? null,
      ratingAverage: product.ratingAverage,
      ratingCount: product.ratingCount,
      attributes: (product.attributeValues ?? []).map((v) => ({
        name: v.attributeDefinition.name,
        slug: v.attributeDefinition.slug,
        value: v.value,
      })),
      sourceAttributions: (product.sources ?? []).flatMap((source) =>
        source.attribution ? [source.attribution] : [],
      ),
      variants: (product.variants ?? []).map((v) => ({
        id: v.id,
        sku: v.sku,
        attributes: Object.fromEntries(
          v.attributeValues.map((a) => [a.attributeDefinition.name, a.value]),
        ),
        label:
          v.attributeValues.map((a) => `${a.attributeDefinition.name}: ${a.value}`).join(' · ') ||
          v.sku ||
          'Variant',
      })),
      // The offer the primary "Add to cart" button targets — cheapest
      // ACTIVE offer wins the buy box, same rule as the PLP. A shopper who
      // wants a different seller picks from `offers` instead.
      offerId: cheapest?.id ?? null,
      priceCents: cheapest?.priceCents ?? 0,
      compareAtPriceCents: cheapest?.compareAtPriceCents ?? null,
      stockQuantity: product.offers.reduce((sum, o) => sum + o.stockQuantity, 0),
      offers: product.offers.map((o) => ({
        id: o.id,
        variantId: o.variantId ?? null,
        variantLabel:
          product.variants
            ?.find((v) => v.id === o.variantId)
            ?.attributeValues.map((a) => `${a.attributeDefinition.name}: ${a.value}`)
            .join(' · ') ?? null,
        priceCents: o.priceCents,
        compareAtPriceCents: o.compareAtPriceCents,
        stockQuantity: o.stockQuantity,
        condition: o.condition,
        vendor: o.vendor,
      })),
    };
  }

  private async loadProductWithOffers(tx: Prisma.TransactionClient, productId: string) {
    const product = await tx.product.findUniqueOrThrow({
      where: { id: productId },
      include: {
        category: { select: CATEGORY_SELECT },
        brand: { select: BRAND_SELECT },
        media: { orderBy: { position: 'asc' } },
        offers: {
          where: { status: OfferStatus.ACTIVE },
          include: { vendor: { select: { id: true, name: true, slug: true } } },
        },
      },
    });
    return product;
  }

  /** Keeps the system vendor's offer for `productId` in step with an admin
   * product edit's price/stock — every stock delta gets its own
   * InventoryAdjustment row in the same transaction, same discipline as
   * checkout/cancellation. Falls back to creating the offer if one
   * somehow doesn't exist yet (defensive; createProduct always makes one). */
  private async syncSystemVendorOffer(
    tx: Prisma.TransactionClient,
    productId: string,
    priceCents: number | undefined,
    stockQuantity: number | undefined,
    compareAtPriceCents?: number | null,
    offerId?: string,
    pricing: ReturnType<typeof offerPricingData> = {},
  ): Promise<void> {
    const systemVendorId = await this.getSystemVendorId(tx);
    const offer = await tx.vendorOffer.findFirst({
      where: offerId
        ? { id: offerId, productId }
        : { vendorId: systemVendorId, productId, variantId: null },
    });
    if (offerId && !offer)
      throw new BadRequestException('The selected offer does not belong to this product.');

    if (!offer) {
      if (!priceCents)
        throw new BadRequestException('Set a regular price before creating an offer.');
      if (await tx.productVariant.count({ where: { productId } }))
        throw new BadRequestException(
          'This product uses variants. Select an existing variant offer.',
        );
      const created = await tx.vendorOffer.create({
        data: {
          vendorId: systemVendorId,
          productId,
          vendorSku: productId,
          priceCents: priceCents ?? 0,
          compareAtPriceCents: compareAtPriceCents ?? null,
          stockQuantity: stockQuantity ?? 0,
          status: OfferStatus.ACTIVE,
          ...pricing,
        },
      });
      if ((stockQuantity ?? 0) > 0) {
        await tx.inventoryAdjustment.create({
          data: {
            vendorOfferId: created.id,
            delta: stockQuantity!,
            reason: 'CORRECTION',
            reference: `admin-update:${productId}`,
          },
        });
      }
      return;
    }

    const nextPrice = priceCents ?? offer.priceCents;
    const nextStock = stockQuantity ?? offer.stockQuantity;
    const nextCompareAt =
      compareAtPriceCents === undefined ? offer.compareAtPriceCents : compareAtPriceCents;
    if (nextCompareAt != null && nextCompareAt <= nextPrice) {
      throw new BadRequestException('The original price must exceed the discounted price');
    }
    const delta = nextStock - offer.stockQuantity;

    await tx.vendorOffer.update({
      where: { id: offer.id },
      data: {
        priceCents: nextPrice,
        stockQuantity: nextStock,
        ...(compareAtPriceCents !== undefined ? { compareAtPriceCents } : {}),
        ...pricing,
      },
    });

    if (delta !== 0) {
      await tx.inventoryAdjustment.create({
        data: {
          vendorOfferId: offer.id,
          delta,
          reason: 'CORRECTION',
          reference: `admin-update:${productId}`,
        },
      });
    }
  }

  private systemVendorIdCache: string | null = null;

  private async getSystemVendorId(
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<string> {
    if (this.systemVendorIdCache) return this.systemVendorIdCache;
    const vendor = await client.vendor.findUnique({
      where: { slug: SYSTEM_VENDOR_SLUG },
      select: { id: true },
    });
    if (!vendor) {
      throw new ConflictException(
        'The platform vendor is not set up — run `pnpm --filter @shopnest/api migrate:backfill-vendor-offers` first.',
      );
    }
    this.systemVendorIdCache = vendor.id;
    return vendor.id;
  }

  private async ensureCategoryExists(categoryId: string): Promise<void> {
    const cat = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!cat) throw new NotFoundException('Category not found');
  }

  private async ensureBrandExists(brandId: string): Promise<void> {
    const brand = await this.prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) throw new NotFoundException('Brand not found');
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
      const reserved = table === 'category' && !!categoryRedirect(candidate);
      if (!existing && !reserved) return candidate;
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
  private async priceProducts<
    T extends {
      id: string;
      brandId?: string | null;
      categoryId: string;
      productType?: string | null;
      offers: Array<Omit<PriceInput, 'quantity'> & { stockQuantity: number }>;
    },
  >(products: T[]): Promise<T[]> {
    const automatic = (await this.promotions?.activeAutomatic()) ?? [];
    return products.map((product) => ({
      ...product,
      offers: product.offers
        .map((offer) => {
          const line = calculatePrices(
            [
              {
                ...offer,
                productId: product.id,
                brandId: product.brandId,
                categoryId: product.categoryId,
                productType: product.productType,
                quantity: 1,
              },
            ],
            automatic,
          ).lines[0];
          const regularTotal = calculatePrices([
            {
              ...offer,
              priceCents: offer.compareAtPriceCents ?? offer.priceCents,
              compareAtPriceCents: null,
              discountEnabled: false,
              quantity: 1,
            },
          ]).totalCents;
          return {
            ...offer,
            priceCents: line.totalCents,
            compareAtPriceCents: regularTotal > line.totalCents ? regularTotal : null,
          };
        })
        .sort(
          (a, b) =>
            Number(b.stockQuantity > 0) - Number(a.stockQuantity > 0) ||
            a.priceCents - b.priceCents,
        ),
    }));
  }
}
