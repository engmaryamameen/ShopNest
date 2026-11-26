import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CatalogSourceAdapter,
  FetchProductsResult,
  SupplierProduct,
  SourceCategory,
} from './catalog-source.adapter';
import { normalizeGtin } from './product-identifiers';

type OpenFoodFactsProduct = {
  ingredients_text?: string;
  quantity?: string;
  packaging?: string;
  origins?: string;
  labels?: string;
  nutriments?: Record<string, unknown>;
  images?: Record<string, unknown>;
  code?: unknown;
  product_name?: unknown;
  generic_name?: unknown;
  brands?: unknown;
  image_url?: unknown;
  selected_images?: unknown;
  categories_tags?: unknown;
};

/** Open Food Facts — open, keyless, real (world.openfoodfacts.org). Unlike
 * DummyJSON, it carries no commercial data (no price, no stock) — only
 * catalog metadata. `SupplierProduct.priceCents`/`stockQuantity` are left
 * undefined here on purpose; CatalogImportService creates the canonical
 * Product DRAFT and offer-less for those, for an admin to price and
 * publish through the ordinary product-edit form. */
@Injectable()
export class OpenFoodFactsAdapter implements CatalogSourceAdapter {
  protected readonly site: string = 'openfoodfacts.org';
  protected readonly configPrefix: string = 'openFoodFacts';
  protected readonly sourceName: string = 'Open Food Facts';
  private readonly logger = new Logger(OpenFoodFactsAdapter.name);

  constructor(protected readonly config: ConfigService) {}

  private taxonomy: { loadedAt: number; entries: SourceCategory[] } | undefined;
  private readonly pages = new Map<string, { expiresAt: number; result: FetchProductsResult }>();

  async categoryTaxonomy(): Promise<SourceCategory[]> {
    if (!this.taxonomy || Date.now() - this.taxonomy.loadedAt > 24 * 60 * 60 * 1000) {
      const response = await fetch(
        `https://static.${this.site}/data/taxonomies/categories.full.json`,
        {
          signal: AbortSignal.timeout(20000),
          headers: { Accept: 'application/json', 'User-Agent': 'ShopNest local catalog research' },
        },
      );
      if (!response.ok) throw new BadGatewayException('Could not load food categories');
      const data = (await response.json()) as Record<
        string,
        { name?: Record<string, string>; parents?: string[] }
      >;
      const entries = Object.entries(data).map(([id, value]) => ({
        id,
        name: value.name?.en ?? Object.values(value.name ?? {})[0] ?? id,
        parents: value.parents ?? [],
      }));
      this.taxonomy = { loadedAt: Date.now(), entries };
    }
    return this.taxonomy.entries;
  }

  async searchCategories(query: string): Promise<SourceCategory[]> {
    const entries = await this.categoryTaxonomy();
    const term = query.trim().toLocaleLowerCase();
    return entries
      .filter((entry) => entry.id.startsWith('en:'))
      .filter((entry) =>
        term ? entry.name.toLocaleLowerCase().includes(term) : !entry.parents.length,
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 50);
  }

  async fetchProducts(
    options: { categories?: string[]; page?: number; limit?: number; position?: number } = {},
  ): Promise<FetchProductsResult> {
    const cacheKey = JSON.stringify({
      categories: options.categories ?? [],
      page: options.page ?? 1,
    });
    const cached = this.pages.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.result;
    const baseUrl =
      this.config.get<string>(`app.${this.configPrefix}Url`) ?? `https://world.${this.site}`;
    const timeoutMs = this.config.get<number>('app.openFoodFactsTimeoutMs') ?? 20000;
    const pageSize = this.config.get<number>('app.openFoodFactsPageSize') ?? 100;

    const byExternalId = new Map<string, OpenFoodFactsProduct>();
    let skippedCount = 0;
    let successfulCategories = 0;
    let exhausted = true;
    const categories = options.categories?.length ? options.categories : [''];
    for (const category of categories) {
      // Each category is an independent search, not a page of one
      // resource — unlike DummyJSON's single paginated feed, one
      // category's failure has no bearing on the others' validity, so it's
      // retried a couple of times and then skipped, not fatal to the whole
      // fetch. Verified live against the real API: it genuinely, routinely
      // 503s a fraction of rapid sequential requests, so tolerating that is
      // ordinary operation here, not an edge case.
      let page: OpenFoodFactsProduct[];
      try {
        page = await this.fetchCategoryWithRetry(
          baseUrl,
          timeoutMs,
          pageSize,
          category,
          options.page ?? 1,
        );
      } catch (error) {
        exhausted = false;
        this.logger.warn(
          `Skipping Open Food Facts category "${category}": ${(error as Error).message}`,
        );
        continue;
      }
      successfulCategories++;
      if (page.length >= pageSize) exhausted = false;
      for (const product of page) {
        const code =
          typeof product.code === 'string' && product.code.trim().length > 0
            ? product.code.trim()
            : undefined;
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
      throw new BadGatewayException(
        'Open Food Facts is temporarily unavailable or rate limiting requests. Please wait a few minutes and try again.',
      );
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

    const result = { products: normalized, skippedCount, exhausted };
    if (this.pages.size >= 8) this.pages.delete(this.pages.keys().next().value!);
    this.pages.set(cacheKey, { expiresAt: Date.now() + 300000, result });
    return result;
  }

  private async fetchCategoryWithRetry(
    baseUrl: string,
    timeoutMs: number,
    pageSize: number,
    category: string,
    page: number,
    attempts = 3,
  ): Promise<OpenFoodFactsProduct[]> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await this.fetchCategory(baseUrl, timeoutMs, pageSize, category, page);
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
    page: number,
  ): Promise<OpenFoodFactsProduct[]> {
    const url =
      `${baseUrl}/api/v2/search?categories_tags_en=${encodeURIComponent(category.replace(/^en:/, ''))}` +
      `&sort_by=code&fields=code,product_name,generic_name,categories_tags,image_url,selected_images,brands,ingredients_text,nutriments,quantity,packaging,origins,labels,images` +
      `&page_size=${pageSize}` +
      (page > 1 ? `&page=${page}` : '');

    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          Accept: 'application/json',
          'User-Agent': 'ShopNest/1.0 (https://github.com/engmaryamameen/ShopNest)',
        },
      });
    } catch {
      throw new BadGatewayException('Catalog supplier is unavailable');
    }

    if (!response.ok)
      throw new BadGatewayException(`Catalog supplier returned HTTP ${response.status}`);

    const body = (await response.json()) as { products?: unknown };
    if (!Array.isArray(body.products))
      throw new BadGatewayException('Catalog supplier response is invalid');
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
      this.logger.debug(
        `Skipping Open Food Facts record with no usable code/name (code=${String(product.code)})`,
      );
      return null;
    }

    const categoryName = this.mostSpecificCategory(product.categories_tags);
    if (!categoryName) return null;

    const brand =
      typeof product.brands === 'string' && product.brands.trim().length > 0
        ? product.brands.split(',')[0].trim()
        : undefined;

    const generic = typeof product.generic_name === 'string' ? product.generic_name.trim() : '';
    const description =
      generic.length >= 10 ? generic : brand ? `${name} by ${brand}.` : `${name}.`;

    const imageUrls = this.selectedImages(product);
    const imageDimensions = Object.fromEntries(
      imageUrls.flatMap((url) => {
        const filename = url.split('/').pop() ?? '';
        const key = filename
          .replace(/(?:\.\d+)?\.full\.(?:jpg|png)$/, '')
          .replace(/\.(?:jpg|png)$/, '');
        const metadata = product.images?.[key] as
          | { sizes?: { full?: { w?: number; h?: number } } }
          | undefined;
        const size = metadata?.sizes?.full;
        return size?.w && size.h ? [[url, { width: size.w, height: size.h }]] : [];
      }),
    );

    return {
      externalId,
      name,
      description,
      categoryName,
      sourceCategoryIds: Array.isArray(product.categories_tags)
        ? product.categories_tags.filter((id): id is string => typeof id === 'string')
        : [],
      brand,
      imageUrl: imageUrls[0],
      imageUrls,
      imageDimensions,
      imageCount: imageUrls.length,
      gtin: normalizeGtin(externalId),
      productType: this.sourceName === 'Open Food Facts' ? 'Grocery' : 'Personal care',
      specifications: Object.fromEntries(
        Object.entries({
          Ingredients: product.ingredients_text,
          Quantity: product.quantity,
          Packaging: product.packaging,
          Origins: product.origins,
          Labels: product.labels,
          ...Object.fromEntries(
            Object.entries(product.nutriments ?? {})
              .filter(([key, value]) => key.endsWith('_100g') && typeof value === 'number')
              .slice(0, 15)
              .map(([key, value]) => [
                `${key.replace(/_100g$/, '').replace(/-/g, ' ')} (per 100g)`,
                String(value),
              ]),
          ),
        }).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && !!entry[1]),
      ),
      attribution: {
        name: this.sourceName,
        url: `https://world.${this.site}/product/${externalId}`,
        license: 'Database: ODbL; contents: DbCL; images: CC BY-SA',
      },
    };
  }

  private selectedImages(product: OpenFoodFactsProduct): string[] {
    const urls = new Set<string>();
    const photos = new Set<string>();
    const add = (value: unknown) => {
      if (typeof value !== 'string' || !value) return;
      const canonical = value.replace(/\.(?:100|200|400|800)\.(jpg|png)$/, '.full.$1');
      const key = canonical.replace(/\.(?:full|[0-9]+)\.(jpg|png)$/, '.$1');
      if (!photos.has(key)) {
        photos.add(key);
        urls.add(canonical);
      }
    };
    const code = typeof product.code === 'string' ? product.code : '';
    const folder = code.length > 8 ? code.replace(/^(...)(...)(...)(.*)$/, '$1/$2/$3/$4') : code;
    const originals = new Map<string, string>();
    for (const [id] of Object.entries(product.images ?? {})) {
      if (/^\d+$/.test(id))
        originals.set(id, `https://images.${this.site}/images/products/${folder}/${id}.jpg`);
    }
    // A selected full-size crop is the same photograph as its imgid, often with
    // much less empty background. Keep only one representation of each photo.
    for (const [key, value] of Object.entries(product.images ?? {})) {
      const selected = value as { imgid?: string | number; rev?: string | number };
      if (
        !/^front_|^ingredients_|^nutrition_|^packaging_/.test(key) ||
        !selected.imgid ||
        !selected.rev
      )
        continue;
      const id = String(selected.imgid);
      if (originals.has(id) && !photos.has(id)) {
        photos.add(id);
        add(
          `https://images.${this.site}/images/products/${folder}/${key}.${selected.rev}.full.jpg`,
        );
        originals.delete(id);
      }
    }
    for (const url of originals.values()) add(url);
    // Old records sometimes have selected images but no original image metadata.
    if (!urls.size) {
      add(product.image_url);
      if (product.selected_images && typeof product.selected_images === 'object') {
        for (const group of Object.values(
          product.selected_images as Record<string, { display?: Record<string, string> }>,
        )) {
          for (const value of Object.values(group?.display ?? {})) add(value);
        }
      }
    }
    return [...urls].slice(0, 10);
  }

  /** `categories_tags` is hierarchical, most-specific last (e.g.
   * `["en:snacks","en:sweet-snacks","en:biscuits-and-cakes"]`) — the last
   * `en:`-prefixed entry files the product most precisely. */
  private mostSpecificCategory(tags: unknown): string | null {
    if (!Array.isArray(tags)) return null;
    const englishTags = tags.filter(
      (t): t is string => typeof t === 'string' && t.startsWith('en:'),
    );
    const last = englishTags.at(-1);
    if (!last) return null;
    const readable = last.slice(3).replace(/-/g, ' ').trim();
    return readable.length > 0 ? readable.replace(/\b\w/g, (c) => c.toUpperCase()) : null;
  }
}
