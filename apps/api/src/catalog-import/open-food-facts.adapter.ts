import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CatalogSourceAdapter, FetchProductsResult, SupplierProduct } from './catalog-source.adapter';

type OpenFoodFactsProduct = {
  code?: unknown;
  product_name?: unknown;
  generic_name?: unknown;
  brands?: unknown;
  image_url?: unknown;
  categories_tags?: unknown;
};

// Open Food Facts has no "list everything" endpoint — its catalog is
// millions of products worldwide — so, like any curated import, the fetch
// is scoped to a fixed set of real, populated grocery category tags rather
// than "all of them." An admin narrows further via the preview/scope
// filters shared with every other source.
const GROCERY_CATEGORIES = [
  'snacks',
  'beverages',
  'dairies',
  'breakfasts',
  'canned-foods',
  'condiments',
  'frozen-foods',
  'breads',
  'confectioneries',
  'pastas',
];

/** Open Food Facts — open, keyless, real (world.openfoodfacts.org). Unlike
 * DummyJSON, it carries no commercial data (no price, no stock) — only
 * catalog metadata. `SupplierProduct.priceCents`/`stockQuantity` are left
 * undefined here on purpose; CatalogImportService creates the canonical
 * Product DRAFT and offer-less for those, for an admin to price and
 * publish through the ordinary product-edit form. */
@Injectable()
export class OpenFoodFactsAdapter implements CatalogSourceAdapter {
  private readonly logger = new Logger(OpenFoodFactsAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async fetchProducts(): Promise<FetchProductsResult> {
    const baseUrl = this.config.get<string>('app.openFoodFactsUrl') ?? 'https://world.openfoodfacts.org';
    const timeoutMs = this.config.get<number>('app.openFoodFactsTimeoutMs') ?? 8000;
    const pageSize = this.config.get<number>('app.openFoodFactsPageSize') ?? 100;

    const byExternalId = new Map<string, OpenFoodFactsProduct>();
    let skippedCount = 0;
    let successfulCategories = 0;
    for (const category of GROCERY_CATEGORIES) {
      // Each category is an independent search, not a page of one
      // resource — unlike DummyJSON's single paginated feed, one
      // category's failure has no bearing on the others' validity, so it's
      // retried a couple of times and then skipped, not fatal to the whole
      // fetch. Verified live against the real API: it genuinely, routinely
      // 503s a fraction of rapid sequential requests, so tolerating that is
      // ordinary operation here, not an edge case.
      let page: OpenFoodFactsProduct[];
      try {
        page = await this.fetchCategoryWithRetry(baseUrl, timeoutMs, pageSize, category);
      } catch (error) {
        this.logger.warn(`Skipping Open Food Facts category "${category}": ${(error as Error).message}`);
        continue;
      }
      successfulCategories++;
      for (const product of page) {
        const code = typeof product.code === 'string' && product.code.trim().length > 0 ? product.code.trim() : undefined;
        if (!code) {
          skippedCount++;
          continue;
        }
        // The same product can legitimately carry more than one of the
        // category tags scoped above — first sighting wins, and a repeat
        // isn't counted as skipped (it's not invalid, just already seen).
        // Unlike DummyJSON, a repeated barcode here isn't a supplier bug.
        if (!byExternalId.has(code)) byExternalId.set(code, product);
      }
    }

    // Every category failed, retries included — that's a real "supplier
    // unavailable" signal worth surfacing, unlike one or two skipped
    // categories out of many.
    if (successfulCategories === 0) {
      throw new BadGatewayException('Catalog supplier is unavailable');
    }

    const normalized: SupplierProduct[] = [];
    for (const product of byExternalId.values()) {
      const result = this.normalize(product);
      if (result === null) {
        skippedCount++;
        continue;
      }
      normalized.push(result);
    }

    return { products: normalized, skippedCount };
  }

  private async fetchCategoryWithRetry(
    baseUrl: string,
    timeoutMs: number,
    pageSize: number,
    category: string,
    attempts = 3,
  ): Promise<OpenFoodFactsProduct[]> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await this.fetchCategory(baseUrl, timeoutMs, pageSize, category);
      } catch (error) {
        lastError = error;
        if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
      }
    }
    throw lastError;
  }

  private async fetchCategory(
    baseUrl: string,
    timeoutMs: number,
    pageSize: number,
    category: string,
  ): Promise<OpenFoodFactsProduct[]> {
    const url =
      `${baseUrl}/api/v2/search?categories_tags_en=${encodeURIComponent(category)}` +
      `&fields=code,product_name,generic_name,categories_tags,image_url,brands` +
      `&page_size=${pageSize}`;

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { Accept: 'application/json' } });
    } catch {
      throw new BadGatewayException('Catalog supplier is unavailable');
    }

    if (!response.ok) throw new BadGatewayException(`Catalog supplier returned HTTP ${response.status}`);

    const body = (await response.json()) as { products?: unknown };
    if (!Array.isArray(body.products)) throw new BadGatewayException('Catalog supplier response is invalid');
    return body.products as OpenFoodFactsProduct[];
  }

  /** Returns `null` (never throws) for a structurally unusable record —
   * counted and skipped rather than losing the whole fetch, same
   * discipline as DummyJsonAdapter. Open Food Facts entries vary widely in
   * completeness (community-submitted), so this filters harder than
   * DummyJSON's normalize does. */
  private normalize(product: OpenFoodFactsProduct): SupplierProduct | null {
    const externalId = typeof product.code === 'string' ? product.code.trim() : '';
    const name = typeof product.product_name === 'string' ? product.product_name.trim() : '';
    if (externalId.length === 0 || name.length < 2) {
      this.logger.debug(`Skipping Open Food Facts record with no usable code/name (code=${String(product.code)})`);
      return null;
    }

    const categoryName = this.mostSpecificCategory(product.categories_tags);
    if (!categoryName) return null;

    const brand =
      typeof product.brands === 'string' && product.brands.trim().length > 0
        ? product.brands.split(',')[0].trim()
        : undefined;

    const generic = typeof product.generic_name === 'string' ? product.generic_name.trim() : '';
    const description = generic.length >= 10 ? generic : brand ? `${name} by ${brand}.` : `${name}.`;

    const imageUrl = typeof product.image_url === 'string' && product.image_url.length > 0 ? product.image_url : undefined;

    return {
      externalId,
      name,
      description,
      categoryName,
      brand,
      imageUrl,
      imageCount: imageUrl ? 1 : 0,
    };
  }

  /** `categories_tags` is hierarchical, most-specific last (e.g.
   * `["en:snacks","en:sweet-snacks","en:biscuits-and-cakes"]`) — the last
   * `en:`-prefixed entry files the product most precisely. */
  private mostSpecificCategory(tags: unknown): string | null {
    if (!Array.isArray(tags)) return null;
    const englishTags = tags.filter((t): t is string => typeof t === 'string' && t.startsWith('en:'));
    const last = englishTags.at(-1);
    if (!last) return null;
    const readable = last.slice(3).replace(/-/g, ' ').trim();
    return readable.length > 0 ? readable.replace(/\b\w/g, (c) => c.toUpperCase()) : null;
  }
}
