import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { CatalogSourceAdapter, SourceCategory, SupplierProduct } from './catalog-source.adapter';
import { explicitAudience } from '../catalog/category-taxonomy';
@Injectable()
export class DarazAdapter implements CatalogSourceAdapter {
  private categories?: SourceCategory[];
  constructor(private readonly config: ConfigService) {}
  private async request(path: string, values: Record<string, string> = {}) {
    const key = this.config.get<string>('app.darazAppKey');
    const secret = this.config.get<string>('app.darazAppSecret');
    const token = this.config.get<string>('app.darazAccessToken');
    if (!key || !secret || !token)
      throw new ServiceUnavailableException(
        'Daraz requires an app key, app secret, and authorized seller access token.',
      );
    const params: Record<string, string> = {
      app_key: key,
      access_token: token,
      timestamp: String(Date.now()),
      sign_method: 'sha256',
      ...values,
    };
    const sign = createHmac('sha256', secret)
      .update(
        path +
          Object.keys(params)
            .sort()
            .map((k) => k + params[k])
            .join(''),
      )
      .digest('hex')
      .toUpperCase();
    const response = await fetch(
      `https://api.daraz.pk/rest${path}?${new URLSearchParams({ ...params, sign })}`,
      { signal: AbortSignal.timeout(20000), redirect: 'error' },
    );
    const body = await response.json();
    if (!response.ok || body.code !== '0')
      throw new BadGatewayException(
        'Daraz rejected the authorized catalog request. Check account access and API permissions.',
      );
    return body.data;
  }
  async searchCategories(query: string): Promise<SourceCategory[]> {
    if (this.categories)
      return this.categories
        .filter((c) =>
          query ? c.name.toLowerCase().includes(query.toLowerCase()) : !c.parents.length,
        )
        .slice(0, 100);
    const roots = await this.request('/category/tree/get');
    const result: SourceCategory[] = [];
    const walk = (
      nodes: Array<{ category_id: number; name: string; children?: unknown[] }>,
      parents: string[],
    ) => {
      for (const c of nodes) {
        result.push({ id: String(c.category_id), name: c.name, parents });
        if (c.children?.length)
          walk(c.children as typeof nodes, [...parents, String(c.category_id)]);
      }
    };
    walk(roots, []);
    this.categories = result;
    return result
      .filter((c) =>
        query ? c.name.toLowerCase().includes(query.toLowerCase()) : !c.parents.length,
      )
      .slice(0, 100);
  }
  async fetchProducts(options: { categories?: string[]; page?: number } = {}) {
    await this.searchCategories('');
    const selected = new Set(options.categories ?? []);
    if (selected.size)
      for (const category of this.categories ?? [])
        if (category.parents.some((id) => selected.has(id))) selected.add(category.id);
    const data = await this.request('/products/get', {
      filter: 'all',
      offset: String(((options.page ?? 1) - 1) * 50),
      limit: '50',
    });
    const products: SupplierProduct[] = [];
    let skippedCount = 0;
    for (const record of data.products ?? []) {
      if (selected.size && !selected.has(String(record.primary_category))) continue;
      const a = record.attributes ?? {};
      const imageUrls = [
        ...new Set<string>(
          [
            ...(record.images ?? []),
            ...(record.skus ?? []).flatMap((sku: { Images?: string[] }) => sku.Images ?? []),
          ].filter((u: unknown) => typeof u === 'string'),
        ),
      ];
      if (!record.item_id || !a.name) {
        skippedCount++;
        continue;
      }
      products.push({
        externalId: String(record.item_id),
        sourceCategoryIds: [String(record.primary_category)],
        audience: explicitAudience([a.gender, a.department, a.name].filter((value): value is string => typeof value === 'string')),
        name: a.name,
        description: a.description || a.short_description || a.name,
        categoryName:
          this.categories?.find((category) => category.id === String(record.primary_category))
            ?.name ?? 'Uncategorized',
        brand:
          typeof a.brand === 'string' && a.brand.toLowerCase() !== 'no brand' ? a.brand : undefined,
        imageUrls,
        imageUrl: imageUrls[0],
        imageCount: imageUrls.length,
        specifications: Object.fromEntries(
          Object.entries(a).filter(
            ([k, v]) =>
              !['name', 'description', 'short_description'].includes(k) && typeof v === 'string',
          ),
        ) as Record<string, string>,
        attribution: {
          name: 'Daraz authorized seller feed',
          url: 'https://open.daraz.com/',
          license: 'Seller-authorized content',
        },
      });
    }
    return { products, skippedCount, exhausted: (data.products?.length ?? 0) < 50 };
  }
}
