import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CatalogSourceAdapter, SupplierProduct } from './catalog-source.adapter';

type DummyJsonProduct = {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  category?: unknown;
  price?: unknown;
  stock?: unknown;
  thumbnail?: unknown;
};

@Injectable()
export class DummyJsonAdapter implements CatalogSourceAdapter {
  constructor(private readonly config: ConfigService) {}

  async fetchProducts(): Promise<SupplierProduct[]> {
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

    const normalized = products.map((value, index) => this.normalize(value, index));
    if (new Set(normalized.map((product) => product.externalId)).size !== normalized.length) {
      throw new BadGatewayException('Catalog supplier returned duplicate product identifiers');
    }
    return normalized;
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

  private normalize(product: DummyJsonProduct, index: number): SupplierProduct {
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

    if (!valid)
      throw new BadGatewayException(`Catalog supplier product at index ${index} is invalid`);

    return {
      externalId: String(product.id),
      name: (product.title as string).trim(),
      description: (product.description as string).trim(),
      categoryName: (product.category as string).trim(),
      priceCents: Math.round((product.price as number) * 100),
      stockQuantity: product.stock as number,
      imageUrl: typeof product.thumbnail === 'string' ? product.thumbnail : undefined,
    };
  }
}
