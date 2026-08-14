import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CatalogSourceAdapter, FetchProductsResult, SupplierProduct } from './catalog-source.adapter';

type DummyJsonProduct = {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  category?: unknown;
  price?: unknown;
  stock?: unknown;
  thumbnail?: unknown;
  images?: unknown;
};

@Injectable()
export class DummyJsonAdapter implements CatalogSourceAdapter {
  private readonly logger = new Logger(DummyJsonAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async fetchProducts(): Promise<FetchProductsResult> {
    const baseUrl = this.config.get<string>('app.catalogImportUrl') ?? 'https://dummyjson.com';
    const timeoutMs = this.config.get<number>('app.catalogImportTimeoutMs') ?? 5000;
    const pageSize = 100;
    const products: DummyJsonProduct[] = [];
    let total = Number.POSITIVE_INFINITY;

    while (products.length < total) {
      const page = await this.fetchPage(baseUrl, timeoutMs, pageSize, products.length);
      products.push(...page.products);
      total = page.total;
      if (page.products.length === 0 && products.length < total) {
        throw new BadGatewayException(
          'Catalog supplier pagination ended before the advertised total',
        );
      }
    }

    // A single malformed record is permanently invalid, not a transient
    // fetch failure — skipped and counted rather than aborting every other,
    // otherwise-valid record in the same fetch. A duplicate external id,
    // by contrast, is a supplier-side data-integrity problem where silently
    // picking one copy could hide real corruption — that still hard-fails
    // the whole fetch rather than being "resolved" on the importer's behalf.
    let skippedCount = 0;
    const normalized: SupplierProduct[] = [];
    for (let index = 0; index < products.length; index++) {
      const result = this.normalize(products[index], index);
      if (result === null) {
        skippedCount++;
        continue;
      }
      normalized.push(result);
    }

    if (new Set(normalized.map((product) => product.externalId)).size !== normalized.length) {
      throw new BadGatewayException('Catalog supplier returned duplicate product identifiers');
    }

    return { products: normalized, skippedCount };
  }

  private async fetchPage(baseUrl: string, timeoutMs: number, limit: number, skip: number) {
    let response: Response;

    try {
      response = await fetch(`${baseUrl}/products?limit=${limit}&skip=${skip}`, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: 'application/json' },
      });
    } catch {
      throw new BadGatewayException('Catalog supplier is unavailable');
    }

    if (!response.ok)
      throw new BadGatewayException(`Catalog supplier returned HTTP ${response.status}`);

    const body = (await response.json()) as { products?: unknown; total?: unknown };
    if (
      !Array.isArray(body.products) ||
      (body.total !== undefined && (!Number.isInteger(body.total) || Number(body.total) < 0))
    ) {
      throw new BadGatewayException('Catalog supplier response is invalid');
    }

    return {
      products: body.products as DummyJsonProduct[],
      total: body.total === undefined ? body.products.length : Number(body.total),
    };
  }

  /** Returns `null` (never throws) for a structurally invalid record — the
   * caller counts and skips it rather than losing the whole fetch over one
   * bad record. */
  private normalize(product: DummyJsonProduct, index: number): SupplierProduct | null {
    const valid =
      Number.isInteger(product.id) &&
      Number(product.id) > 0 &&
      typeof product.title === 'string' &&
      product.title.trim().length >= 2 &&
      typeof product.description === 'string' &&
      product.description.trim().length >= 10 &&
      typeof product.category === 'string' &&
      product.category.trim().length > 0 &&
      typeof product.price === 'number' &&
      Number.isFinite(product.price) &&
      product.price > 0 &&
      Number.isInteger(product.stock) &&
      Number(product.stock) >= 0;

    if (!valid) {
      this.logger.warn(`Skipping invalid supplier product at index ${index} (id=${String(product.id)})`);
      return null;
    }

    const imageUrl = typeof product.thumbnail === 'string' ? product.thumbnail : undefined;
    const imageCount = Array.isArray(product.images) ? product.images.length : imageUrl ? 1 : 0;

    return {
      externalId: String(product.id),
      name: (product.title as string).trim(),
      description: (product.description as string).trim(),
      categoryName: (product.category as string).trim(),
      priceCents: Math.round((product.price as number) * 100),
      stockQuantity: product.stock as number,
      imageUrl,
      imageCount,
    };
  }
}
