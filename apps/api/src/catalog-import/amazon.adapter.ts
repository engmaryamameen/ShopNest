import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CatalogSourceAdapter, SupplierProduct, SourceCategory } from './catalog-source.adapter';
import { normalizeGtin } from './product-identifiers';
import { explicitAudience } from '../catalog/category-taxonomy';
@Injectable()
export class AmazonAdapter implements CatalogSourceAdapter {
  constructor(private readonly config: ConfigService) {}
  private catalog?: {
    loaded: number;
    categories: SourceCategory[];
    versions: Record<string, string>;
  };
  async datasetVersion(category: string) {
    await this.searchCategories('');
    return this.catalog!.versions[category];
  }
  async searchCategories(query: string): Promise<SourceCategory[]> {
    if (!this.catalog || Date.now() - this.catalog.loaded > 86400000) {
      const response = await fetch(
        'https://huggingface.co/api/datasets/McAuley-Lab/Amazon-Reviews-2023/tree/main/raw/meta_categories?limit=100',
        { signal: AbortSignal.timeout(20000) },
      );
      if (!response.ok) throw new BadGatewayException('Could not load Amazon metadata categories');
      const entries = (await response.json()) as Array<{ path: string; oid: string }>;
      this.catalog = {
        loaded: Date.now(),
        versions: Object.fromEntries(
          entries.map((e) => [
            e.path
              .split('/')
              .pop()!
              .replace(/^meta_|\.jsonl$/g, ''),
            e.oid,
          ]),
        ),
        categories: entries
          .filter((e) => /\/meta_.+\.jsonl$/.test(e.path))
          .map((e) => {
            const id = e.path
              .split('/')
              .pop()!
              .replace(/^meta_|\.jsonl$/g, '');
            return { id, name: id.replace(/_/g, ' '), parents: [] };
          }),
      };
    }
    return this.catalog.categories.filter((c) =>
      c.name.toLowerCase().includes(query.toLowerCase()),
    );
  }
  async fetchProducts(options: { categories?: string[]; position?: number; limit?: number } = {}) {
    if (!options.categories?.length)
      throw new ServiceUnavailableException('Select an Amazon metadata category.');
    const categories = await this.searchCategories('');
    const category = options.categories[0];
    if (!categories.some((c) => c.id === category))
      throw new ServiceUnavailableException('Unknown metadata category.');
    const baseUrl = this.config.get<string>('app.amazonBaseUrl')!;
    const position = options.position ?? 0;
    const response = await fetch(`${baseUrl}/meta_${category}.jsonl`, {
      headers: position ? { Range: `bytes=${position}-` } : {},
      signal: AbortSignal.timeout(30000),
    });
    if (response.status === 416)
      return { products: [], skippedCount: 0, exhausted: true, nextPosition: position };
    if (!response.ok || !response.body || (position > 0 && response.status !== 206))
      throw new BadGatewayException('Metadata host did not support incremental range retrieval.');
    const reader = response.body.getReader();
    let buffer = Buffer.alloc(0),
      consumed = position,
      scanned = 0,
      skippedCount = 0,
      exhausted = false;
    const products: SupplierProduct[] = [];
    try {
      while (scanned < (options.limit ?? 50)) {
        const { value, done } = await reader.read();
        if (done) {
          exhausted = true;
          break;
        }
        buffer = Buffer.concat([buffer, value]);
        if (buffer.length > 8 * 1024 * 1024)
          throw new BadGatewayException('Metadata record exceeds size limit.');
        let index: number;
        while ((index = buffer.indexOf(10)) >= 0 && scanned < (options.limit ?? 50)) {
          const line = buffer.subarray(0, index).toString('utf8');
          buffer = buffer.subarray(index + 1);
          consumed += index + 1;
          scanned++;
          try {
            const normalized = this.normalize(JSON.parse(line));
            if (normalized) products.push(normalized);
            else skippedCount++;
          } catch {
            skippedCount++;
          }
        }
      }
      if (exhausted && buffer.length) {
        consumed += buffer.length;
        try {
          const p = this.normalize(JSON.parse(buffer.toString()));
          if (p) products.push(p);
          else skippedCount++;
        } catch {
          skippedCount++;
        }
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    return { products, skippedCount, exhausted, nextPosition: consumed };
  }
  private normalize(record: Record<string, unknown>): SupplierProduct | null {
    if (
      typeof record.parent_asin !== 'string' ||
      typeof record.title !== 'string' ||
      typeof record.main_category !== 'string'
    )
      return null;
    const strings = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && !!s.trim()) : [];
    let images = record.images;
    if (images && !Array.isArray(images) && typeof images === 'object') {
      const values = images as Record<string, string[]>;
      images = (values.large ?? []).map((large, i) => ({ large, hi_res: values.hi_res?.[i] }));
    }
    const photos = new Map<string, string>();
    for (const image of Array.isArray(images) ? images : []) {
      const url = image?.hi_res || image?.large || image?.thumb;
      if (typeof url === 'string') photos.set(url.replace(/\._[^/]+_\./, '.'), url);
    }
    let details = record.details;
    if (typeof details === 'string') {
      try {
        details = JSON.parse(details);
      } catch {
        details = {};
      }
    }
    const specifications =
      details && typeof details === 'object' && !Array.isArray(details)
        ? (Object.fromEntries(
            Object.entries(details)
              .filter(([, v]) => typeof v === 'string')
              .slice(0, 50),
          ) as Record<string, string>)
        : {};
    const gtin = specifications.UPC || specifications.EAN;
    const imageUrls = [...photos.values()];
    const features = strings(record.features);
    return {
      externalId: record.parent_asin,
      sourceCategoryIds: [record.main_category.replace(/ /g, '_')],
      audience: explicitAudience([specifications.Department, specifications.Gender, record.title].filter((value): value is string => typeof value === 'string')),
      name: record.title,
      description: [...strings(record.description), ...features].join('\n\n') || record.title,
      categoryName: record.main_category,
      brand: specifications.Brand || (typeof record.brand === 'string' ? record.brand : undefined),
      imageUrls,
      imageUrl: imageUrls[0],
      imageCount: imageUrls.length,
      specifications,
      gtin: normalizeGtin(gtin),
      productType: record.main_category,
      attribution: {
        name: 'McAuley Lab Amazon Reviews 2023 — product metadata',
        url: 'https://amazon-reviews-2023.github.io/',
        license: 'Source-specific permission required; historical metadata, not current prices',
      },
    };
  }
}
