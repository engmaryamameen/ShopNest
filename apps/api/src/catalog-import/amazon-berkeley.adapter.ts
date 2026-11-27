import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import { CatalogSourceAdapter, SourceCategory, SupplierProduct } from './catalog-source.adapter';
import { explicitAudience } from '../catalog/category-taxonomy';

const ROOT = 'https://amazon-berkeley-objects.s3.us-east-1.amazonaws.com';
const SHARD_POSITION = 100000;
type Localized = Array<{ language_tag?: string; value?: string | number }>;
type Listing = Record<string, unknown> & {
  item_id?: string;
  domain_name?: string;
  item_name?: Localized;
  product_type?: Localized;
  main_image_id?: string;
  other_image_id?: string[];
};
type Image = { width: number; height: number; path: string };

@Injectable()
export class AmazonBerkeleyAdapter implements CatalogSourceAdapter {
  private readonly images = new Map<string, Image>();
  private readonly shards = new Map<number, Map<string, SupplierProduct[]>>();
  private readonly files = new Map<string, Promise<{ path: string; etag: string }>>();
  private initialized?: Promise<void>;
  private version = '';
  constructor(private readonly config: ConfigService) {}

  private english(value: unknown, fallback = false): string[] {
    if (!Array.isArray(value)) return [];
    const entries = value as Localized;
    const english = entries.filter((entry) => entry.language_tag?.startsWith('en'));
    return (english.length ? english : fallback ? entries : []).flatMap((entry) =>
      typeof entry.value === 'string' || typeof entry.value === 'number'
        ? [String(entry.value)]
        : [],
    );
  }

  private file(relative: string) {
    const existing = this.files.get(relative);
    if (existing) return existing;
    const pending = this.loadFile(relative).catch((error) => {
      this.files.delete(relative);
      throw error;
    });
    this.files.set(relative, pending);
    return pending;
  }
  private async loadFile(relative: string) {
    const directory = join(this.config.get<string>('app.catalogCacheDir', '.cache/catalog'), 'abo');
    await mkdir(directory, { recursive: true });
    const path = join(directory, relative.replaceAll('/', '_'));
    const metadataPath = path + '.json';
    try {
      const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as {
        etag: string;
        checkedAt: number;
        bytes: number;
      };
      if ((await stat(path)).size === metadata.bytes && Date.now() - metadata.checkedAt < 86400000)
        return { path, etag: metadata.etag };
    } catch {
      /* A missing cache is prepared from the publisher below. */
    }
    const head = await fetch(`${ROOT}/${relative}`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(20000),
    });
    if (!head.ok) throw new BadGatewayException('Amazon Berkeley Objects metadata is unavailable.');
    const etag = head.headers.get('etag') ?? '';
    const bytes = Number(head.headers.get('content-length'));
    if (!etag || !bytes || bytes > 16 * 1024 * 1024)
      throw new BadGatewayException('Unexpected catalog metadata size.');
    try {
      const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
      if (metadata.etag === etag && (await stat(path)).size === bytes) {
        await writeFile(metadataPath, JSON.stringify({ etag, bytes, checkedAt: Date.now() }));
        return { path, etag };
      }
    } catch {
      /* Download only this bounded metadata shard, never the image archive. */
    }
    const response = await fetch(`${ROOT}/${relative}`, { signal: AbortSignal.timeout(300000) });
    if (!response.ok || !response.body)
      throw new BadGatewayException('Could not download catalog metadata.');
    const reader = response.body.getReader(),
      chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > bytes) throw new Error('Metadata exceeded declared size');
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    if (size !== bytes) throw new BadGatewayException('Catalog metadata download was incomplete.');
    await writeFile(path + '.partial', Buffer.concat(chunks));
    await rename(path + '.partial', path);
    await writeFile(metadataPath, JSON.stringify({ etag, bytes, checkedAt: Date.now() }));
    return { path, etag };
  }

  private async initialize() {
    if (!this.initialized)
      this.initialized = this.prepare().catch((error) => {
        this.initialized = undefined;
        throw error;
      });
    return this.initialized;
  }
  private async prepare() {
    const [imageFile, first] = await Promise.all([
      this.file('images/metadata/images.csv.gz'),
      this.file('listings/metadata/listings_0.json.gz'),
    ]);
    const lines = createInterface({
      input: createReadStream(imageFile.path).pipe(createGunzip()),
      crlfDelay: Infinity,
    });
    for await (const line of lines) {
      const [id, height, width, path] = line.split(',');
      if (
        /^[a-f0-9]{2}\/[a-f0-9]+\.(jpg|png)$/.test(path ?? '') &&
        Number(width) > 0 &&
        Number(height) > 0
      )
        this.images.set(id, { width: Number(width), height: Number(height), path });
    }
    this.version = `abo-cc-by-2023:${first.etag}:${imageFile.etag}`;
    await this.loadShard(0);
  }
  private async loadShard(index: number) {
    const existing = this.shards.get(index);
    if (existing) return existing;
    const file = await this.file(`listings/metadata/listings_${index.toString(16)}.json.gz`);
    const categories = new Map<string, SupplierProduct[]>();
    const lines = createInterface({
      input: createReadStream(file.path).pipe(createGunzip()),
      crlfDelay: Infinity,
    });
    for await (const line of lines) {
      if (!line || line.length > 1024 * 1024) continue;
      const listing = JSON.parse(line) as Listing;
      const product = this.normalize(listing);
      if (product) {
        const items = categories.get(product.productType!) ?? [];
        items.push(product);
        categories.set(product.productType!, items);
      }
    }
    if (this.shards.size >= 2) this.shards.delete(this.shards.keys().next().value!);
    this.shards.set(index, categories);
    return categories;
  }
  async datasetVersion() {
    await this.initialize();
    return this.version;
  }
  async searchCategories(query: string): Promise<SourceCategory[]> {
    await this.initialize();
    const categories = await this.loadShard(0);
    return [...categories.keys()]
      .map((id) => ({ id, name: this.categoryName(id), parents: [] }))
      .filter((category) => category.name.toLowerCase().includes(query.trim().toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  async fetchProducts(options: { categories?: string[]; position?: number; limit?: number } = {}) {
    await this.initialize();
    const position = options.position ?? 0,
      shardIndex = Math.floor(position / SHARD_POSITION),
      offset = position % SHARD_POSITION;
    if (shardIndex >= 16)
      return { products: [], skippedCount: 0, exhausted: true, nextPosition: position };
    const shard = await this.loadShard(shardIndex);
    const items = options.categories?.length
      ? options.categories.flatMap((id) => shard.get(id) ?? [])
      : [...shard.values()].flat();
    const products = items.slice(offset, offset + Math.min(options.limit ?? 50, 100));
    const finished = offset + products.length >= items.length;
    return {
      products,
      skippedCount: 0,
      exhausted: finished && shardIndex === 15,
      nextPosition: finished ? (shardIndex + 1) * SHARD_POSITION : position + products.length,
    };
  }
  private categoryName(type: string) {
    return type
      .toLowerCase()
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
  private normalize(listing: Listing): SupplierProduct | null {
    const name = this.english(listing.item_name)[0],
      type = this.english(listing.product_type, true)[0];
    if (!name || !type || !listing.item_id || !listing.domain_name) return null;
    const photos = [...new Set([listing.main_image_id, ...(listing.other_image_id ?? [])])]
      .flatMap((id) => {
        const image = id ? this.images.get(id) : undefined;
        return image
          ? [
              {
                url: `${ROOT}/images/original/${image.path}`,
                width: image.width,
                height: image.height,
              },
            ]
          : [];
      })
      .slice(0, 10);
    const specifications: Record<string, string> = {};
    for (const [field, label] of Object.entries({
      color: 'Color',
      material: 'Material',
      fabric_type: 'Fabric',
      finish_type: 'Finish',
      style: 'Style',
      model_name: 'Model',
      model_number: 'Model number',
      model_year: 'Model year',
      item_shape: 'Shape',
    })) {
      const value = this.english(
        listing[field],
        !['color', 'material', 'style'].includes(field),
      ).join(', ');
      if (value) specifications[label] = value;
    }
    const dimensions = listing.item_dimensions as
      | Record<string, { value?: number; unit?: string }>
      | undefined;
    if (dimensions)
      for (const [key, value] of Object.entries(dimensions))
        if (Number.isFinite(value.value) && value.unit)
          specifications[key[0].toUpperCase() + key.slice(1)] = `${value.value} ${value.unit}`;
    return {
      externalId: `${listing.domain_name}:${listing.item_id}`,
      sourceCategoryIds: [type],
      audience: explicitAudience([
        ...this.english(listing.department, true),
        ...this.english(listing.target_gender, true),
        name,
      ]),
      name,
      categoryName: this.categoryName(type),
      productType: type,
      brand: this.english(listing.brand, true)[0],
      description:
        [...this.english(listing.product_description), ...this.english(listing.bullet_point)].join(
          '\n\n',
        ) || name,
      specifications,
      imageUrl: photos[0]?.url,
      imageUrls: photos.map((image) => image.url),
      imageCount: photos.length,
      imageDimensions: Object.fromEntries(
        photos.map((image) => [image.url, { width: image.width, height: image.height }]),
      ),
      attribution: {
        name: 'Amazon.com — Amazon Berkeley Objects; Guillaumin, Dideriksen, Deng, Arora, Collins and Malik',
        url: 'https://amazon-berkeley-objects.s3.amazonaws.com/index.html',
        license:
          'CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/. Metadata normalized; images copied unmodified.',
      },
    };
  }
}
