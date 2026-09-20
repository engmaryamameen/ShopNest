import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CatalogSourceAdapter, FetchProductsResult, SupplierProduct } from './catalog-source.adapter';

type AmazonImage = { thumb?: unknown; large?: unknown; hi_res?: unknown };

type AmazonMetaRecord = {
  parent_asin?: unknown;
  title?: unknown;
  description?: unknown;
  features?: unknown;
  main_category?: unknown;
  store?: unknown;
  price?: unknown;
  images?: unknown;
};

// One JSONL file per category from the McAuley Lab "Amazon Reviews 2023"
// dataset (huggingface.co/datasets/McAuley-Lab/Amazon-Reviews-2023) — no
// search/filter API and no "everything" feed, so, like Open Food Facts,
// the fetch is scoped to a fixed set of real category files. Each file can
// run into the hundreds of megabytes; streamCategory() stops reading once
// it has enough valid records rather than downloading the whole thing.
// Chosen for broad general-marketplace coverage — every name here is a
// real file, checked live (HEAD request) before being added.
const AMAZON_CATEGORIES = [
  'Electronics',
  'Home_and_Kitchen',
  'Cell_Phones_and_Accessories',
  'Clothing_Shoes_and_Jewelry',
  'Sports_and_Outdoors',
  'Toys_and_Games',
  'Office_Products',
  'Grocery_and_Gourmet_Food',
  'Pet_Supplies',
  'Video_Games',
  'All_Beauty',
  'Tools_and_Home_Improvement',
];

/** Amazon Reviews 2023 catalog metadata — open, keyless, real, verified
 * live against the actual Hugging Face-hosted files. Carries several real
 * images per product (unlike DummyJSON/Open Food Facts, which carry one)
 * and, for most records, no usable price — same "may have no commercial
 * data" shape as Open Food Facts, so CatalogImportService's DRAFT/
 * offer-less path applies here too. There's no stock/inventory concept in
 * a static dataset at all, so stockQuantity is always left undefined. */
@Injectable()
export class AmazonAdapter implements CatalogSourceAdapter {
  private readonly logger = new Logger(AmazonAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async fetchProducts(): Promise<FetchProductsResult> {
    const baseUrl = this.config.get<string>('app.amazonBaseUrl') ?? '';
    const timeoutMs = this.config.get<number>('app.amazonTimeoutMs') ?? 20000;
    const perCategoryLimit = this.config.get<number>('app.amazonPerCategoryLimit') ?? 150;

    const byExternalId = new Map<string, AmazonMetaRecord>();
    let skippedCount = 0;
    let successfulCategories = 0;

    for (const category of AMAZON_CATEGORIES) {
      let records: AmazonMetaRecord[];
      try {
        records = await this.streamCategory(baseUrl, category, timeoutMs, perCategoryLimit);
      } catch (error) {
        this.logger.warn(`Skipping Amazon category "${category}": ${(error as Error).message}`);
        continue;
      }
      successfulCategories++;
      for (const record of records) {
        const id =
          typeof record.parent_asin === 'string' && record.parent_asin.trim().length > 0
            ? record.parent_asin.trim()
            : undefined;
        if (!id) {
          skippedCount++;
          continue;
        }
        // A product can recur across scanned lines in the same file in
        // rare cases (dataset artifacts) — first sighting wins, same
        // "not a skip" treatment as Open Food Facts's cross-category dedup.
        if (!byExternalId.has(id)) byExternalId.set(id, record);
      }
    }

    if (successfulCategories === 0) {
      throw new BadGatewayException('Catalog supplier is unavailable');
    }

    const normalized: SupplierProduct[] = [];
    for (const record of byExternalId.values()) {
      const result = this.normalize(record);
      if (result === null) {
        skippedCount++;
        continue;
      }
      normalized.push(result);
    }

    return { products: normalized, skippedCount };
  }

  /** Reads the category's JSONL file as a stream and stops — cancelling
   * the underlying connection, not just breaking the read loop — once
   * `limit` structurally-parseable lines are collected. A malformed line
   * is skipped, not fatal: a multi-gigabyte community-scale dump having
   * one bad line is expected, not exceptional. */
  private async streamCategory(
    baseUrl: string,
    category: string,
    timeoutMs: number,
    limit: number,
  ): Promise<AmazonMetaRecord[]> {
    const url = `${baseUrl}/meta_${category}.jsonl`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    } catch {
      clearTimeout(timer);
      throw new BadGatewayException('Catalog supplier is unavailable');
    }

    if (!response.ok || !response.body) {
      clearTimeout(timer);
      throw new BadGatewayException(`Catalog supplier returned HTTP ${response.status}`);
    }

    const records: AmazonMetaRecord[] = [];
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (records.length < limit) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) >= 0 && records.length < limit) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (line.trim().length === 0) continue;
          try {
            records.push(JSON.parse(line) as AmazonMetaRecord);
          } catch {
            // one malformed line — skip, not fatal to the rest of the file.
          }
        }
      }
    } finally {
      clearTimeout(timer);
      // Stops the download the moment enough records are collected —
      // without this, the connection keeps streaming the rest of a
      // 100MB+ file we no longer want any of.
      await reader.cancel().catch(() => undefined);
    }

    return records;
  }

  private normalize(record: AmazonMetaRecord): SupplierProduct | null {
    const externalId = typeof record.parent_asin === 'string' ? record.parent_asin.trim() : '';
    const name = typeof record.title === 'string' ? record.title.trim() : '';
    if (externalId.length === 0 || name.length < 2) return null;

    const categoryName = typeof record.main_category === 'string' ? record.main_category.trim() : '';
    if (categoryName.length === 0) return null;

    const brand = typeof record.store === 'string' && record.store.trim().length > 0 ? record.store.trim() : undefined;

    const descriptionParts = this.stringArray(record.description);
    const featureParts = this.stringArray(record.features);
    const description =
      descriptionParts.join(' ').trim() ||
      featureParts.join(' ').trim() ||
      (brand ? `${name} by ${brand}.` : `${name}.`);

    const imageUrls = this.extractImages(record.images);
    const priceCents = this.extractPriceCents(record.price);

    return {
      externalId,
      name,
      description,
      categoryName,
      brand,
      imageUrl: imageUrls[0],
      imageUrls,
      imageCount: imageUrls.length,
      priceCents,
      // A static dataset has no notion of live inventory — never set, so
      // this always takes CatalogImportService's DRAFT/offer-less path
      // regardless of whether a price happens to be present.
      stockQuantity: undefined,
    };
  }

  private stringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim());
  }

  /** Prefers the highest-resolution real URL per listed image
   * (`hi_res` > `large` > `thumb`), in the order Amazon listed them. */
  private extractImages(images: unknown): string[] {
    if (!Array.isArray(images)) return [];
    const urls: string[] = [];
    for (const entry of images) {
      if (!entry || typeof entry !== 'object') continue;
      const image = entry as AmazonImage;
      const url =
        typeof image.hi_res === 'string'
          ? image.hi_res
          : typeof image.large === 'string'
            ? image.large
            : typeof image.thumb === 'string'
              ? image.thumb
              : undefined;
      if (url) urls.push(url);
    }
    return urls;
  }

  /** Most records carry no usable price (`null` or `0`) — this dataset is
   * catalog metadata, not live commerce data. `0` is excluded along with
   * `null`/absent: it's never a real price, just how missing data is
   * sometimes encoded here. */
  private extractPriceCents(price: unknown): number | undefined {
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return undefined;
    return Math.round(price * 100);
  }
}
