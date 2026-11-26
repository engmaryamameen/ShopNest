import {
  BadRequestException,
  ConflictException,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CatalogImportRun,
  CatalogImportStatus,
  CatalogSource,
  Prisma,
  TaxClass,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import sanitizeHtml = require('sanitize-html');
import { PrismaService } from '../prisma/prisma.service';
import { SYSTEM_VENDOR_SLUG } from '../catalog/system-vendor.constants';
import { SupplierProduct } from './catalog-source.adapter';
import { ArchiveImportedProductsDto } from './dto/archive-imported-products.dto';
import { ImportScopeDto } from './dto/import-scope.dto';
import { CatalogImportImagesService } from './catalog-import-images.service';
import { CatalogSourceRegistry } from './catalog-source-registry';
import { calculatePrices, PricingPromotion } from '../pricing/price-calculator';
import { offerPricingData, validateOfferPricing } from '../pricing/offer-pricing.dto';
import { PromotionsService } from '../promotions/promotions.service';
import { CreatePromotionDto } from '../promotions/dto/create-promotion.dto';
import { writeProductSpecifications } from '../catalog/product-specifications';
import { isAllowedImageUrl } from '../common/validators/allowed-image-url';
import { CategoryMappingService, supplierCategoryIds } from '../catalog/category-mapping.service';

export type ImportScope = Omit<ImportScopeDto, 'source'>;
export interface ImportPreviewItem {
  externalId: string;
  name: string;
  categoryName: string;
  categoryId?: string;
  categoryPath?: string;
  sourceCategoryName?: string;
  brand?: string;
  imageUrl?: string;
  imageCount: number;
  action: 'create' | 'update' | 'unchanged';
  specifications?: Record<string, string>;
  proposedOffer?: SupplierProduct['proposedOffer'];
  pricing?: ReturnType<typeof calculatePrices>;
  issues?: string[];
}
export interface ImportPreview {
  previewId: string;
  discoveredCount: number;
  scopedCount: number;
  skippedCount: number;
  wouldCreateCount: number;
  wouldUpdateCount: number;
  wouldBeUnchangedCount: number;
  wouldRejectImageCount: number;
  sample: ImportPreviewItem[];
  exhausted?: boolean;
  scanLimitReached?: boolean;
  unmappedCount?: number;
  unmappedCategories?: Array<{ id: string; name: string; count: number }>;
  performance?: { scanningMs: number; previewGenerationMs: number };
}
type Checkpoint = { category: string; version: string; position: number; exhausted: boolean };
type Snapshot = {
  products: SupplierProduct[];
  configuration: string;
  checkpoints: Checkpoint[];
  rescan?: boolean;
  promotion?: CreatePromotionDto;
  promotionId?: string;
  promotionTarget?: ImportScope['promotionTarget'];
  actorUserId?: string;
  taxClass?: TaxClass | null;
  statistics?: { scanned: number; duplicates: number; invalid: number; rejectedImages: number };
  review?: Omit<ImportPreview, 'previewId'>;
};

@Injectable()
export class CatalogImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: CatalogSourceRegistry,
    private readonly config: ConfigService,
    @Optional() private readonly imageImporter?: CatalogImportImagesService,
    @Optional() private readonly promotions?: PromotionsService,
    @Optional()
    private readonly categoryMapping: CategoryMappingService = new CategoryMappingService(prisma),
  ) {}

  private assertImportEnabled() {
    if (this.config.get<boolean>('app.catalogImportEnabled') !== true)
      throw new ServiceUnavailableException('Catalog imports are disabled in this environment.');
  }
  private assertSourceAllowed(source: CatalogSource) {
    if (
      source === CatalogSource.DUMMY_JSON &&
      this.config.get<string>('app.nodeEnv', process.env.NODE_ENV ?? 'development') !== 'test'
    )
      throw new BadRequestException('DummyJSON is reserved for automated tests.');
    if (source === CatalogSource.AMAZON && !this.config.get<boolean>('app.amazonLicenseConfirmed'))
      throw new ServiceUnavailableException(
        'Amazon metadata has no explicit reuse license in the publisher dataset card. Source-specific permission is required.',
      );
    if (source === CatalogSource.DARAZ && !this.darazAvailable())
      throw new ServiceUnavailableException(
        'Daraz requires an application key, secret, and authorized seller access token.',
      );
    this.registry.resolve(source);
  }
  private darazAvailable() {
    return ['darazAppKey', 'darazAppSecret', 'darazAccessToken'].every(
      (key) => !!this.config.get<string>(`app.${key}`),
    );
  }
  sources() {
    return [
      {
        id: CatalogSource.AMAZON_BERKELEY,
        name: 'Amazon Berkeley Objects',
        available: true,
        reason:
          'General merchandise · CC BY 4.0 metadata and real catalog photos; historical catalog, no live prices.',
      },
      {
        id: CatalogSource.OPEN_FOOD_FACTS,
        name: 'Open Food Facts',
        available: true,
        reason: 'Groceries · ODbL data and CC BY-SA images',
      },
      {
        id: CatalogSource.OPEN_BEAUTY_FACTS,
        name: 'Open Beauty Facts',
        available: true,
        reason: 'Personal care · ODbL data and CC BY-SA images',
      },
      {
        id: CatalogSource.AMAZON,
        name: 'Amazon historical metadata',
        available: !!this.config.get<boolean>('app.amazonLicenseConfirmed'),
        reason: 'Publisher does not state a reuse license; source-specific permission required.',
      },
      {
        id: CatalogSource.DARAZ,
        name: 'Daraz seller catalog',
        available: this.darazAvailable(),
        reason: 'Requires an application key, secret, and seller authorization.',
      },
    ];
  }
  async searchCategories(source: CatalogSource, query: string) {
    this.assertImportEnabled();
    this.assertSourceAllowed(source);
    const categories =
      (await this.registry.resolve(source).searchCategories?.(query.slice(0, 100))) ?? [];
    await this.prepareCategoryMappings(source);
    return this.categoryMapping.annotate(source, categories);
  }
  private async prepareCategoryMappings(source: CatalogSource) {
    const taxonomy = (await this.registry.resolve(source).categoryTaxonomy?.()) ?? [];
    this.categoryMapping.configure(source, taxonomy);
  }
  listImportedProducts() {
    return this.prisma.productSource.findMany({
      select: { productId: true, source: true, importRunId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }
  async options() {
    const [
      vendors,
      categories,
      taxClasses,
      brands,
      managementVendors,
      runs,
      sourceFilters,
      promotions,
    ] = await Promise.all([
      this.prisma.vendor.findMany({
        where: { status: 'APPROVED' },
        select: { id: true, name: true, slug: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.category.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.taxClass.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.brand.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.vendor.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.catalogImportRun.findMany({
        select: { id: true, source: true, startedAt: true },
        orderBy: { startedAt: 'desc' },
        take: 100,
      }),
      this.prisma.productSource.findMany({ distinct: ['source'], select: { source: true } }),
      this.prisma.promotion.findMany({
        where: {
          scope: 'PLATFORM',
          isActive: true,
          brandIds: { isEmpty: true },
          categoryIds: { isEmpty: true },
          vendorIds: { isEmpty: true },
          productTypes: { isEmpty: true },
        },
        orderBy: { code: 'asc' },
        take: 100,
      }),
    ]);
    return {
      sources: this.sources(),
      vendors,
      categories,
      taxClasses,
      brands,
      managementVendors,
      runs,
      promotions,
      sourceFilters: sourceFilters.map((row) => row.source),
      currency: 'USD',
    };
  }
  private configuration(scope: ImportScope) {
    const settings = Object.fromEntries(
      Object.entries(scope).filter(([key]) => !['previewId', 'selectedProductIds'].includes(key)),
    );
    // Ignore request key order; every value that affects a preview is bound to its snapshot.
    const canonical = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(canonical)
        : value && typeof value === 'object'
          ? Object.fromEntries(
              Object.entries(value)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, v]) => [key, canonical(v)]),
            )
          : value;
    return JSON.stringify(canonical(settings));
  }
  private stableNumber(key: string, min: number, max: number) {
    return min + (createHash('sha256').update(key).digest().readUInt32BE(0) % (max - min + 1));
  }
  private async validateScope(scope: ImportScope) {
    if (scope.maxImageCount !== undefined && scope.maxImageCount < (scope.minImageCount ?? 1))
      throw new BadRequestException(
        'Photos per product must be at least the minimum unique image count.',
      );
    if (
      scope.promotionTarget === 'VENDORS' &&
      scope.demoPriceCents === undefined &&
      !scope.pricingStrategy
    )
      throw new BadRequestException('Create offers before targeting their vendors.');
    if (scope.promotionId && scope.promotion)
      throw new BadRequestException('Choose an existing promotion or create a new one.');
    if (scope.promotionId) {
      const promotion = await this.prisma.promotion.findUnique({
        where: { id: scope.promotionId },
      });
      if (
        !promotion ||
        promotion.scope !== 'PLATFORM' ||
        !promotion.isActive ||
        [
          promotion.brandIds,
          promotion.categoryIds,
          promotion.productTypes,
          promotion.vendorIds,
        ].some((targets) => targets.length)
      )
        throw new BadRequestException(
          'Choose an active platform coupon with product-only or marketplace-wide eligibility.',
        );
    }
    if (scope.promotion) {
      this.promotions?.validateConfiguration(scope.promotion);
      if (await this.prisma.promotion.findUnique({ where: { code: scope.promotion.code } }))
        throw new BadRequestException('That promotion code is already in use.');
    }
    if (
      (scope.demoPriceCents === undefined) !== (scope.demoStockQuantity === undefined) &&
      !scope.pricingStrategy
    )
      throw new BadRequestException('Enter both a price and quantity.');
    if (
      scope.minPriceCents !== undefined &&
      scope.maxPriceCents !== undefined &&
      scope.minPriceCents > scope.maxPriceCents
    )
      throw new BadRequestException('Maximum price must be at least the minimum.');
    if (
      scope.minStock !== undefined &&
      scope.maxStock !== undefined &&
      scope.minStock > scope.maxStock
    )
      throw new BadRequestException('Maximum stock must be at least the minimum.');
    for (const rule of scope.categoryPrices ?? [])
      if (rule.minCents > rule.maxCents)
        throw new BadRequestException('Category price ranges must be ordered.');
    if (
      scope.targetCategoryId &&
      !(await this.prisma.category.findUnique({ where: { id: scope.targetCategoryId } }))
    )
      throw new BadRequestException('Choose an existing ShopNest category.');
    if (
      scope.taxClassId &&
      !(await this.prisma.taxClass.findFirst({ where: { id: scope.taxClassId, isActive: true } }))
    )
      throw new BadRequestException('Choose an active tax class.');
    try {
      validateOfferPricing(scope);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }
  async queuePreview(source: CatalogSource, scope: ImportScope) {
    this.assertImportEnabled();
    this.assertSourceAllowed(source);
    await this.validateScope(scope);
    const preview = await this.prisma.catalogImportPreview.create({
      data: {
        source,
        status: 'PREPARING',
        requestScope: JSON.parse(JSON.stringify(scope)),
        products: {},
        expiresAt: new Date(Date.now() + 2 * 60 * 60000),
      },
    });
    return { previewId: preview.id, status: preview.status };
  }
  async previewStatus(id: string) {
    const preview = await this.prisma.catalogImportPreview.findUniqueOrThrow({ where: { id } });
    if (preview.expiresAt < new Date())
      throw new ConflictException('Preview expired. Prepare a new preview.');
    const snapshot = preview.products as unknown as Snapshot;
    return {
      previewId: id,
      status: preview.status,
      errorMessage: preview.errorMessage,
      progress: (preview.products as Record<string, Prisma.JsonValue>)?.progress,
      partialSample: (preview.products as Record<string, Prisma.JsonValue>)?.partialSample,
      ...snapshot.review,
    };
  }
  async prepareQueuedPreview(id: string) {
    const preview = await this.prisma.catalogImportPreview.findUniqueOrThrow({ where: { id } });
    try {
      await this.preview(preview.source, preview.requestScope as ImportScope, id);
    } catch (error) {
      await this.prisma.catalogImportPreview.update({
        where: { id },
        data: {
          status: 'FAILED',
          lockedAt: null,
          errorMessage: (error as Error).message.slice(0, 1000),
        },
      });
    }
  }
  async preview(
    source: CatalogSource,
    scope: ImportScope = {},
    previewRowId?: string,
  ): Promise<ImportPreview> {
    this.assertImportEnabled();
    this.assertSourceAllowed(source);
    await this.validateScope(scope);
    const adapter = this.registry.resolve(source);
    if (!scope.targetCategoryId) await this.prepareCategoryMappings(source);
    const categorySession = await this.categoryMapping.session(source);
    const requested = scope.maxRecords ?? 10;
    const deadline =
      performance.now() + Math.min(30 * 60000, Math.max(10 * 60000, requested * 20000));
    const categories = scope.categoryScope?.length ? scope.categoryScope : [''];
    const publishing = scope.demoPriceCents !== undefined || scope.pricingStrategy !== undefined;
    const vendors = publishing
      ? await this.prisma.vendor.findMany({
          where: {
            status: 'APPROVED',
            ...(scope.vendorIds?.length
              ? { id: { in: scope.vendorIds } }
              : { slug: SYSTEM_VENDOR_SLUG }),
          },
          select: { id: true, name: true },
          orderBy: { id: 'asc' },
        })
      : [];
    if (
      publishing &&
      (!vendors.length ||
        (scope.vendorIds?.length && vendors.length !== new Set(scope.vendorIds).size))
    )
      throw new BadRequestException('Select approved vendors for publishing.');
    const taxClass = scope.taxClassId
      ? await this.prisma.taxClass.findUnique({ where: { id: scope.taxClassId } })
      : null;
    const automatic: PricingPromotion[] = (await this.promotions?.activeAutomatic()) ?? [];
    if (
      scope.promotion?.automatic &&
      new Date(scope.promotion.startsAt) <= new Date() &&
      new Date(scope.promotion.endsAt) >= new Date()
    )
      automatic.push({
        ...scope.promotion,
        id: 'pending-import-promotion',
        scope: 'PLATFORM',
        vendorId: null,
        productIds: [],
      });
    const products: SupplierProduct[] = [],
      sample: ImportPreviewItem[] = [],
      checkpoints: Checkpoint[] = [];
    const seen = new Set<string>();
    const seenGtins = new Set<string>();
    let scanned = 0,
      duplicates = 0,
      invalid = 0,
      rejectedImages = 0,
      unmapped = 0,
      pages = 0,
      exhausted = true;
    const unmappedCategories = new Map<string, { id: string; name: string; count: number }>();
    let lastProgressAt = 0,
      lastProgressCount = 0;
    let scanningMs = 0,
      previewGenerationMs = 0;
    let progressWrite: Promise<unknown> | undefined;
    const publishProgress = async (
      details: Record<string, string | number> = {},
      force = false,
    ) => {
      if (!previewRowId) return;
      if (progressWrite) {
        await progressWrite;
        if (!force) return;
      }
      if (
        !force &&
        performance.now() - lastProgressAt < 1000 &&
        products.length - lastProgressCount < 5
      )
        return;
      lastProgressAt = performance.now();
      lastProgressCount = products.length;
      progressWrite = this.prisma.catalogImportPreview.update({
        where: { id: previewRowId },
        data: {
          lockedAt: new Date(),
          products: JSON.parse(
            JSON.stringify({
              progress: {
                scanned,
                eligible: products.length,
                requested,
                duplicates,
                skipped: invalid,
                phase: 'scanning',
                ...details,
              },
              partialSample: sample.slice(0, 10),
            }),
          ),
        },
      });
      try {
        await progressWrite;
      } finally {
        progressWrite = undefined;
      }
    };
    const scanBudget = Math.min(5000, Math.max(200, requested * 20));
    for (const category of categories) {
      const version = adapter.datasetVersion
        ? await adapter.datasetVersion(category)
        : `api-v2-code-${this.config.get<number>('app.openFoodFactsPageSize', 100)}`;
      const key = { source, category, version };
      const saved = scope.rescan
        ? null
        : await this.prisma.catalogSourceCheckpoint.findUnique({
            where: { source_category_version: key },
          });
      let position =
        saved?.position ??
        (source === CatalogSource.AMAZON || source === CatalogSource.AMAZON_BERKELEY ? 0 : 1);
      let done = saved?.exhausted ?? false;
      while (
        !done &&
        products.length < requested &&
        scanned < scanBudget &&
        pages < 30 &&
        performance.now() < deadline
      ) {
        if (previewRowId)
          await this.prisma.catalogImportPreview.update({
            where: { id: previewRowId },
            data: { lockedAt: new Date() },
          });
        const result = await adapter.fetchProducts({
          categories: category ? [category] : undefined,
          page: position,
          position,
          limit: 50,
        });
        pages++;
        invalid += result.skippedCount;
        scanned += result.skippedCount;
        const [existing, gtinMatches] = await Promise.all([
          this.prisma.productSource.findMany({
            where: { source, externalId: { in: result.products.map((p) => p.externalId) } },
            select: { externalId: true },
          }),
          result.products.some((p) => p.gtin)
            ? this.prisma.product.findMany({
                where: { gtin: { in: result.products.flatMap((p) => (p.gtin ? [p.gtin] : [])) } },
                select: { gtin: true },
              })
            : Promise.resolve([]),
        ]);
        const existingIds = new Set(existing.map((p) => p.externalId));
        const matchedGtins = new Set(gtinMatches.map((p) => p.gtin));
        const brandNames = [
          ...new Set(result.products.flatMap((p) => (p.brand ? [p.brand.slice(0, 200)] : []))),
        ];
        const brandMatches =
          automatic.some((p) => p.brandIds?.length) && brandNames.length
            ? await this.prisma.brand.findMany({
                where: { name: { in: brandNames } },
                select: { id: true, name: true },
              })
            : [];
        const brandIds = new Map(brandMatches.map((b) => [b.name, b.id]));
        const categoryAssignments = await categorySession.resolve(
          result.products,
          scope.targetCategoryId,
        );
        const imageTasks = new Map<number, Promise<string[]>>();
        const allImageTasks: Promise<string[]>[] = [];
        let imageCursor = 0;
        const imageUrls = (candidate: SupplierProduct) =>
          (candidate.imageUrls?.length
            ? candidate.imageUrls
            : candidate.imageUrl
              ? [candidate.imageUrl]
              : []
          ).filter((url) => {
            const size = candidate.imageDimensions?.[url];
            return (
              !size ||
              (Math.max(size.width, size.height) >= (scope.minImageDimension ?? 0) &&
                Math.max(size.width, size.height) <= 8000)
            );
          });
        const prefetchImages = () => {
          while (
            imageTasks.size < Math.min(2, requested - products.length) &&
            imageCursor < result.products.length &&
            scanned < scanBudget &&
            performance.now() < deadline
          ) {
            const index = imageCursor++,
              candidate = result.products[index],
              urls = imageUrls(candidate);
            if (
              !categoryAssignments.has(candidate.externalId) ||
              seen.has(candidate.externalId) ||
              existingIds.has(candidate.externalId) ||
              (candidate.gtin &&
                (matchedGtins.has(candidate.gtin) || seenGtins.has(candidate.gtin))) ||
              urls.length < (scope.minImageCount ?? 1)
            )
              continue;
            const task = this.imageImporter
              ? this.imageImporter.ingest(
                  urls,
                  scope.minImageDimension ?? 0,
                  async (checked, total) =>
                    publishProgress({
                      phase: 'images',
                      productName: candidate.name,
                      imagesChecked: checked,
                      imageTotal: total,
                    }),
                  scope.maxImageCount ?? Math.max(3, scope.minImageCount ?? 1),
                )
              : Promise.resolve(urls);
            imageTasks.set(index, task);
            allImageTasks.push(task);
          }
        };
        let consumedEntirePage = true;
        for (const [candidateIndex, candidate] of result.products.entries()) {
          const scanningStarted = performance.now();
          if (
            products.length >= requested ||
            scanned >= scanBudget ||
            performance.now() >= deadline
          ) {
            consumedEntirePage = false;
            break;
          }
          scanned++;
          if (
            seen.has(candidate.externalId) ||
            existingIds.has(candidate.externalId) ||
            (candidate.gtin && (matchedGtins.has(candidate.gtin) || seenGtins.has(candidate.gtin)))
          ) {
            duplicates++;
            imageTasks.delete(candidateIndex);
            scanningMs += performance.now() - scanningStarted;
            continue;
          }
          const assignment = categoryAssignments.get(candidate.externalId);
          if (!assignment) {
            invalid++;
            unmapped++;
            const id = supplierCategoryIds(source, candidate).at(-1) ?? candidate.categoryName;
            const previous = unmappedCategories.get(id);
            unmappedCategories.set(id, {
              id,
              name: candidate.categoryName,
              count: (previous?.count ?? 0) + 1,
            });
            scanningMs += performance.now() - scanningStarted;
            continue;
          }
          const urls = imageUrls(candidate);
          rejectedImages +=
            (candidate.imageUrls?.length ?? (candidate.imageUrl ? 1 : 0)) - urls.length;
          if (urls.length < (scope.minImageCount ?? 1)) {
            invalid++;
            scanningMs += performance.now() - scanningStarted;
            continue;
          }
          prefetchImages();
          scanningMs += performance.now() - scanningStarted;
          await publishProgress({ phase: 'images', productName: candidate.name });
          const images = await (imageTasks.get(candidateIndex) ?? Promise.resolve([]));
          imageTasks.delete(candidateIndex);
          seen.add(candidate.externalId);
          rejectedImages += urls.length - images.length;
          if (images.length < (scope.minImageCount ?? 1)) {
            invalid++;
            continue;
          }
          const previewStarted = performance.now();
          const product: SupplierProduct = {
            ...candidate,
            imageUrls: images,
            imageUrl: images[0],
            imageCount: images.length,
            targetCategoryId: assignment.id,
          };
          if (publishing) {
            const vendor = vendors[products.length % vendors.length];
            const rule = scope.categoryPrices?.find(
              (r) => r.category === category || r.category === candidate.categoryName,
            );
            if (scope.pricingStrategy === 'CATEGORY' && !rule)
              throw new BadRequestException(
                `Configure a price range for ${category || candidate.categoryName}.`,
              );
            const min = rule?.minCents ?? scope.minPriceCents ?? scope.demoPriceCents ?? 999;
            const max = rule?.maxCents ?? scope.maxPriceCents ?? min;
            const priceCents =
              !scope.pricingStrategy || scope.pricingStrategy === 'FIXED'
                ? (scope.demoPriceCents ?? min)
                : this.stableNumber(`${source}:${candidate.externalId}:price`, min, max);
            const stockQuantity =
              scope.minStock !== undefined
                ? this.stableNumber(
                    `${source}:${candidate.externalId}:stock`,
                    scope.minStock,
                    scope.maxStock ?? scope.minStock,
                  )
                : (scope.demoStockQuantity ?? 20);
            product.proposedOffer = {
              vendorId: vendor.id,
              vendorName: vendor.name,
              priceCents,
              stockQuantity,
              ...scopePricing(scope),
            };
            try {
              validateOfferPricing(product.proposedOffer);
            } catch (e) {
              throw new BadRequestException((e as Error).message);
            }
          }
          products.push(product);
          if (product.gtin) seenGtins.add(product.gtin);
          const brandId = product.brand ? brandIds.get(product.brand.slice(0, 200)) : undefined;
          const categoryId = assignment.id;
          sample.push({
            externalId: product.externalId,
            name: product.name,
            categoryName: assignment.name,
            categoryId: assignment.id,
            categoryPath: assignment.path,
            sourceCategoryName: product.categoryName,
            brand: product.brand,
            imageUrl: product.imageUrl,
            imageCount: product.imageCount,
            specifications: product.specifications,
            proposedOffer: product.proposedOffer,
            action: 'create',
            issues: [],
            pricing: product.proposedOffer
              ? calculatePrices(
                  [
                    {
                      ...product.proposedOffer,
                      id: product.externalId,
                      productId: '',
                      brandId,
                      categoryId,
                      productType: product.productType,
                      quantity: 1,
                      taxClass,
                    },
                  ],
                  automatic.filter(
                    (promotion) =>
                      promotion.id !== 'pending-import-promotion' ||
                      ((scope.promotionTarget !== 'BRANDS' || !!product.brand) &&
                        (scope.promotionTarget !== 'PRODUCT_TYPES' || !!product.productType)),
                  ),
                )
              : undefined,
          });
          previewGenerationMs += performance.now() - previewStarted;
          await publishProgress();
        }
        await Promise.all(allImageTasks);
        // Partial pages are deliberately revisited: duplicates are cheap and skipped;
        // unselected/unexamined records must remain reachable on the next import.
        if (consumedEntirePage) {
          position = result.nextPosition ?? position + 1;
          done = result.exhausted ?? result.products.length === 0;
        }
        if (!consumedEntirePage) break;
      }
      checkpoints.push({ category, version, position, exhausted: done });
      exhausted = exhausted && done;
      if (
        products.length >= requested ||
        scanned >= scanBudget ||
        pages >= 30 ||
        performance.now() >= deadline
      )
        break;
    }
    const review = {
      discoveredCount: scanned,
      scopedCount: products.length,
      skippedCount: invalid,
      wouldCreateCount: products.length,
      wouldUpdateCount: 0,
      wouldBeUnchangedCount: duplicates,
      wouldRejectImageCount: rejectedImages,
      sample,
      exhausted,
      scanLimitReached: scanned >= scanBudget || pages >= 30 || performance.now() >= deadline,
      unmappedCount: unmapped,
      unmappedCategories: [...unmappedCategories.values()].slice(0, 50),
      performance: { scanningMs, previewGenerationMs },
    };
    if (
      scope.promotionTarget === 'BRANDS' &&
      products.length &&
      !products.some((product) => product.brand)
    )
      throw new BadRequestException(
        'These products have no brands to target. Choose a different promotion scope.',
      );
    if (
      scope.promotionTarget === 'PRODUCT_TYPES' &&
      products.length &&
      !products.some((product) => product.productType)
    )
      throw new BadRequestException(
        'These products have no product types to target. Choose a different promotion scope.',
      );
    const snapshot: Snapshot = {
      products,
      checkpoints,
      configuration: this.configuration(scope),
      rescan: scope.rescan,
      promotion: scope.promotion,
      promotionId: scope.promotionId,
      promotionTarget: scope.promotionTarget,
      taxClass,
      statistics: { scanned, duplicates, invalid, rejectedImages },
      review,
    };
    if (!products.length)
      await this.prisma.$transaction((tx) => this.saveCheckpoints(tx, source, snapshot));
    const data = {
      source,
      status: 'READY',
      products: JSON.parse(JSON.stringify(snapshot)),
      expiresAt: new Date(Date.now() + 30 * 60000),
      lockedAt: null,
      errorMessage: null,
    };
    const saved = previewRowId
      ? await this.prisma.catalogImportPreview.update({ where: { id: previewRowId }, data })
      : await this.prisma.catalogImportPreview.create({ data });
    return { previewId: saved.id, ...review };
  }
  async enqueue(
    source: CatalogSource,
    scope: ImportScope = {},
    actorUserId?: string,
  ): Promise<CatalogImportRun> {
    this.assertImportEnabled();
    this.assertSourceAllowed(source);
    if (!scope.previewId) {
      const preview = await this.preview(source, scope);
      return this.enqueue(source, { ...scope, previewId: preview.previewId }, actorUserId);
    }
    if (!scope.targetCategoryId) await this.prepareCategoryMappings(source);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const preview = await tx.catalogImportPreview.findUnique({
          where: { id: scope.previewId },
        });
        if (
          !preview ||
          preview.status !== 'READY' ||
          preview.source !== source ||
          preview.expiresAt <= new Date()
        )
          throw new ConflictException(
            'Preview expired or still preparing. Preview products again.',
          );
        const snapshot = preview.products as unknown as Snapshot;
        if (!snapshot.products || snapshot.configuration !== this.configuration(scope))
          throw new ConflictException('Configuration changed. Preview products again.');
        const selected = scope.selectedProductIds;
        const products = selected
          ? snapshot.products.filter((p) => selected.includes(p.externalId))
          : snapshot.products;
        if (!products.length || (selected && products.length !== new Set(selected).size))
          throw new BadRequestException('Select eligible products from this preview.');
        const categorySession = await this.categoryMapping.session(source, tx);
        const currentCategories = await categorySession.resolve(products, scope.targetCategoryId);
        if (
          products.some((product) => {
            const current = currentCategories.get(product.externalId);
            const reviewed = snapshot.review?.sample.find(
              (item) => item.externalId === product.externalId,
            );
            return (
              !product.targetCategoryId ||
              current?.id !== product.targetCategoryId ||
              (reviewed?.categoryPath && reviewed.categoryPath !== current.path)
            );
          })
        )
          throw new ConflictException('Category mappings changed. Preview products again.');
        if (
          scope.taxClassId &&
          JSON.stringify(await tx.taxClass.findUnique({ where: { id: scope.taxClassId } })) !==
            JSON.stringify(snapshot.taxClass)
        )
          throw new ConflictException('Tax configuration changed. Preview products again.');
        const assignedVendorIds = [
          ...new Set(products.flatMap((p) => (p.proposedOffer ? [p.proposedOffer.vendorId] : []))),
        ];
        if (
          assignedVendorIds.length &&
          (
            await tx.vendor.findMany({
              where: { id: { in: assignedVendorIds }, status: 'APPROVED' },
              select: { id: true },
            })
          ).length !== assignedVendorIds.length
        )
          throw new ConflictException('Vendor availability changed. Preview products again.');
        if (
          (
            await tx.productSource.findMany({
              where: { source, externalId: { in: products.map((p) => p.externalId) } },
              select: { externalId: true },
            })
          ).length
        )
          throw new ConflictException(
            'Products were imported since this preview. Preview products again.',
          );
        if ((await tx.catalogImportPreview.deleteMany({ where: { id: preview.id } })).count !== 1)
          throw new ConflictException('Preview already used.');
        return tx.catalogImportRun.create({
          data: {
            source,
            status: CatalogImportStatus.QUEUED,
            categoryScope: scope.categoryScope ?? [],
            maxRecords: scope.maxRecords ?? null,
            scopedCount: products.length,
            minImageCount: scope.minImageCount ?? null,
            discoveredCount: snapshot.statistics?.scanned ?? products.length,
            unchangedCount: snapshot.statistics?.duplicates ?? 0,
            skippedCount: snapshot.statistics?.invalid ?? 0,
            imagesRejectedCount: snapshot.statistics?.rejectedImages ?? 0,
            candidateSnapshot: JSON.parse(JSON.stringify({ ...snapshot, products, actorUserId })),
            demoPriceCents: scope.demoPriceCents ?? null,
            demoStockQuantity: scope.demoStockQuantity ?? null,
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('An import for this source is already queued or running.');
      throw error;
    }
  }
  async executeRun(runId: string) {
    this.assertImportEnabled();
    let run = await this.prisma.catalogImportRun.findUniqueOrThrow({ where: { id: runId } });
    this.assertSourceAllowed(run.source);
    let snapshot = run.candidateSnapshot as unknown as Snapshot;
    if (!snapshot) {
      const remaining = Math.max(0, (run.maxRecords ?? (run.scopedCount || 10)) - run.createdCount);
      if (!remaining)
        return this.prisma.catalogImportRun.update({
          where: { id: runId },
          data: {
            status: 'SUCCEEDED',
            completedAt: new Date(),
            lockedAt: null,
            lockedBy: null,
            errorMessage: null,
          },
        });
      const preview = await this.preview(run.source, {
        categoryScope: run.categoryScope,
        maxRecords: remaining,
        minImageCount: run.minImageCount ?? undefined,
        ...(run.demoPriceCents != null
          ? { demoPriceCents: run.demoPriceCents, demoStockQuantity: run.demoStockQuantity ?? 20 }
          : {}),
      });
      const saved = await this.prisma.catalogImportPreview.findUniqueOrThrow({
        where: { id: preview.previewId },
      });
      snapshot = saved.products as unknown as Snapshot;
      run = await this.prisma.catalogImportRun.update({
        where: { id: run.id },
        data: {
          candidateSnapshot: saved.products as Prisma.InputJsonValue,
          processedCount: 0,
          discoveredCount: { increment: preview.discoveredCount },
          skippedCount: { increment: preview.skippedCount },
        },
      });
    }
    // Backward compatibility for jobs queued by the previous implementation.
    const products = Array.isArray(snapshot)
      ? (snapshot as unknown as SupplierProduct[])
      : snapshot.products;
    if (!products) throw new BadRequestException('Import snapshot is invalid.');
    if (Array.isArray(snapshot)) {
      const platformVendor =
        run.demoPriceCents != null
          ? await this.prisma.vendor.findUnique({
              where: { slug: SYSTEM_VENDOR_SLUG },
              select: { id: true, name: true },
            })
          : null;
      const mediaOrigin = new URL(
        this.config.get<string>('app.mediaPublicBaseUrl', 'http://localhost:3001'),
      ).origin;
      for (const product of products.slice(run.processedCount)) {
        const images: string[] = [];
        for (const url of (product.imageUrls ?? (product.imageUrl ? [product.imageUrl] : [])).slice(
          0,
          10,
        )) {
          if (isAllowedImageUrl(url) && new URL(url).origin === mediaOrigin) images.push(url);
          else if (this.imageImporter) images.push(...(await this.imageImporter.ingest([url])));
        }
        product.imageUrls = [...new Set(images)];
        product.imageUrl = product.imageUrls[0];
        product.imageCount = product.imageUrls.length;
        if (product.imageCount < (run.minImageCount ?? 0))
          throw new BadRequestException(
            'Images from this older preview are unavailable. Prepare a new preview.',
          );
        if (platformVendor && run.demoPriceCents != null && run.demoStockQuantity != null)
          product.proposedOffer = {
            vendorId: platformVendor.id,
            vendorName: platformVendor.name,
            priceCents: run.demoPriceCents,
            stockQuantity: run.demoStockQuantity,
          };
      }
      snapshot = { products, configuration: '', checkpoints: [] };
      await this.prisma.catalogImportRun.update({
        where: { id: runId },
        data: { candidateSnapshot: JSON.parse(JSON.stringify(snapshot)) },
      });
    }
    const size = this.config.get<number>('app.catalogImportBatchSize', 10);
    if (products.some((product) => !product.targetCategoryId))
      await this.prepareCategoryMappings(run.source);
    await this.prisma.catalogImportRun.update({
      where: { id: runId },
      data: { scopedCount: products.length, status: 'RUNNING' },
    });
    for (let offset = run.processedCount; offset < products.length; offset += size) {
      const batch = products.slice(offset, offset + size);
      await this.prisma.$transaction(
        async (tx) => {
          const [lock] = await tx.$queryRaw<
            Array<{ acquired: boolean }>
          >`SELECT pg_try_advisory_xact_lock(hashtext(${`catalog:${run.source}`})) AS acquired`;
          if (!lock?.acquired)
            throw new ConflictException('Another import owns this source. Retry shortly.');
          let created = 0,
            duplicates = 0;
          const categorySession = await this.categoryMapping.session(run.source, tx);
          const legacyAssignments = await categorySession.resolve(
            batch.filter((product) => !product.targetCategoryId),
          );
          for (const product of batch) {
            if (
              (await tx.productSource.findUnique({
                where: {
                  source_externalId: { source: run.source, externalId: product.externalId },
                },
              })) ||
              (product.gtin && (await tx.product.findUnique({ where: { gtin: product.gtin } })))
            ) {
              duplicates++;
              continue;
            }
            const assignment = product.targetCategoryId
              ? categorySession.assignment(product.targetCategoryId)
              : legacyAssignments.get(product.externalId);
            if (!assignment)
              throw new BadRequestException(
                `No active ShopNest category is mapped for ${product.categoryName}. Configure a category mapping and prepare a new preview.`,
              );
            await this.createProduct(
              tx,
              run.source,
              { ...product, targetCategoryId: assignment.id },
              runId,
            );
            created++;
          }
          await tx.catalogImportRun.update({
            where: { id: runId },
            data: {
              processedCount: { increment: batch.length },
              createdCount: { increment: created },
              unchangedCount: { increment: duplicates },
              lockedAt: new Date(),
            },
          });
        },
        { timeout: 15000 },
      );
    }
    return this.prisma.$transaction(async (tx) => {
      if (snapshot.promotion && snapshot.actorUserId && this.promotions) {
        const imported = await tx.product.findMany({
          where: { sources: { some: { importRunId: runId } } },
          select: { id: true, brandId: true, categoryId: true, productType: true },
        });
        const target = snapshot.promotionTarget ?? 'IMPORT';
        const unique = (values: Array<string | null | undefined>) => [
          ...new Set(values.filter((value): value is string => !!value)),
        ];
        const targeting = {
          productIds: target === 'IMPORT' ? imported.map((p) => p.id) : [],
          brandIds: target === 'BRANDS' ? unique(imported.map((p) => p.brandId)) : [],
          categoryIds: target === 'CATEGORIES' ? unique(imported.map((p) => p.categoryId)) : [],
          productTypes:
            target === 'PRODUCT_TYPES' ? unique(imported.map((p) => p.productType)) : [],
          vendorIds:
            target === 'VENDORS' ? unique(products.map((p) => p.proposedOffer?.vendorId)) : [],
        };
        if (imported.length)
          await this.promotions.createPlatform(
            snapshot.actorUserId,
            { ...snapshot.promotion, ...targeting },
            tx,
          );
      }
      if (snapshot.promotionId && this.promotions) {
        const imported = await tx.productSource.findMany({
          where: { importRunId: runId },
          select: { productId: true },
        });
        await this.promotions.assignProducts(
          snapshot.promotionId,
          imported.map((p) => p.productId),
          tx,
        );
      }
      await this.saveCheckpoints(tx, run.source, snapshot);
      return tx.catalogImportRun.update({
        where: { id: runId },
        data: {
          status: 'SUCCEEDED',
          completedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          errorMessage: null,
        },
      });
    });
  }
  private async saveCheckpoints(
    tx: Prisma.TransactionClient,
    source: CatalogSource,
    snapshot: Snapshot,
  ) {
    for (const checkpoint of snapshot.checkpoints ?? []) {
      const { category, version, position, exhausted } = checkpoint;
      const key = { source, category, version };
      const current = await tx.catalogSourceCheckpoint.findUnique({
        where: { source_category_version: key },
      });
      if (!current || snapshot.rescan || position >= current.position)
        await tx.catalogSourceCheckpoint.upsert({
          where: { source_category_version: key },
          create: { ...key, position, exhausted },
          update: { position, exhausted },
        });
    }
  }
  private async createProduct(
    tx: Prisma.TransactionClient,
    source: CatalogSource,
    incoming: SupplierProduct,
    runId: string,
  ) {
    if (!incoming.targetCategoryId)
      throw new BadRequestException('A mapped ShopNest category is required.');
    const category = await tx.category.findUnique({ where: { id: incoming.targetCategoryId } });
    if (!category || !category.isActive)
      throw new BadRequestException('The mapped ShopNest category is no longer active.');
    const brand = incoming.brand
      ? await tx.brand.upsert({
          where: { name: incoming.brand.slice(0, 200) },
          update: {},
          create: {
            name: incoming.brand.slice(0, 200),
            slug: `${this.slugify(incoming.brand).slice(0, 120)}-${createHash('sha256').update(incoming.brand).digest('hex').slice(0, 8)}`,
          },
        })
      : null;
    const product = await tx.product.create({
      data: {
        name: incoming.name.slice(0, 200),
        description: sanitizeHtml(incoming.description, { allowedTags: [], allowedAttributes: {} }),
        slug: `${this.slugify(incoming.name).slice(0, 130)}-${this.slugify(source)}-${this.slugify(incoming.externalId)}`,
        categoryId: category.id,
        brandId: brand?.id,
        gtin: incoming.gtin,
        productType: incoming.productType,
        publishStatus: incoming.proposedOffer ? 'PUBLISHED' : 'DRAFT',
      },
    });
    await tx.productSource.create({
      data: {
        productId: product.id,
        source,
        externalId: incoming.externalId,
        checksum: createHash('sha256').update(JSON.stringify(incoming)).digest('hex'),
        lastSeenAt: new Date(),
        importRunId: runId,
        attribution: incoming.attribution
          ? JSON.parse(JSON.stringify(incoming.attribution))
          : undefined,
      },
    });
    const images = [
      ...new Set(incoming.imageUrls ?? (incoming.imageUrl ? [incoming.imageUrl] : [])),
    ];
    if (images.length)
      await tx.productMedia.createMany({
        data: images.map((url, position) => ({
          productId: product.id,
          url,
          position,
          altText: incoming.name,
        })),
      });
    await writeProductSpecifications(
      tx,
      product.id,
      Object.fromEntries(
        Object.entries(incoming.specifications ?? {})
          .slice(0, 50)
          .map(([name, value]) => [name.slice(0, 150), value.slice(0, 4000)]),
      ),
    );
    if (incoming.proposedOffer) {
      const proposal = incoming.proposedOffer;
      const offer = await tx.vendorOffer.create({
        data: {
          importRunId: runId,
          vendorId: proposal.vendorId,
          productId: product.id,
          vendorSku: `${source.toLowerCase()}-${incoming.externalId}`,
          priceCents: proposal.priceCents,
          stockQuantity: proposal.stockQuantity,
          status: 'ACTIVE',
          ...offerPricingData(proposal),
        },
      });
      if (proposal.stockQuantity)
        await tx.inventoryAdjustment.create({
          data: {
            vendorOfferId: offer.id,
            delta: proposal.stockQuantity,
            reason: 'IMPORT_INITIAL',
            reference: `import:${runId}`,
          },
        });
    }
  }
  async archiveImportedProducts(filter: ArchiveImportedProductsDto, apply: boolean) {
    if (!filter.source && !filter.runId && !filter.categoryId && !filter.productIds?.length)
      throw new ConflictException('Choose products, a source, category, or import run.');
    const base: Prisma.ProductWhereInput = {
      publishStatus: { not: 'ARCHIVED' },
      sources: {
        some: {
          ...(filter.source ? { source: filter.source } : {}),
          ...(filter.runId ? { importRunId: filter.runId } : {}),
        },
      },
      ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
      ...(filter.productIds ? { id: { in: filter.productIds } } : {}),
    };
    const where: Prisma.ProductWhereInput = { ...base, offers: { none: { importRunId: null } } };
    const [eligible, total] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.count({ where: base }),
    ]);
    if (!apply || !eligible) return { eligible, excluded: total - eligible, archived: 0 };
    const result = await this.prisma.product.updateMany({
      where,
      data: { publishStatus: 'ARCHIVED' },
    });
    return { eligible, excluded: total - eligible, archived: result.count };
  }
  listRuns(limit = 20) {
    return this.prisma.catalogImportRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }
  async retry(runId: string) {
    const run = await this.prisma.catalogImportRun.findUniqueOrThrow({ where: { id: runId } });
    if (run.status !== 'FAILED') throw new ConflictException('Only failed imports can be retried.');
    return this.prisma.catalogImportRun.update({
      where: { id: runId },
      data: {
        status: 'QUEUED',
        attemptCount: 0,
        availableAt: new Date(),
        completedAt: null,
        errorMessage: null,
      },
    });
  }
  private slugify(value: string) {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
function scopePricing(scope: ImportScope) {
  return {
    taxable: scope.taxable,
    priceIncludesTax: scope.priceIncludesTax,
    taxClassId: scope.taxClassId,
    discountEnabled: scope.discountEnabled,
    discountType: scope.discountType,
    discountValue: scope.discountValue,
    discountStartsAt: scope.discountStartsAt,
    discountEndsAt: scope.discountEndsAt,
  };
}
