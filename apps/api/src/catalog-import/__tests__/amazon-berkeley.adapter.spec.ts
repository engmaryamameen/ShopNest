import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { ConfigService } from '@nestjs/config';
import { AmazonBerkeleyAdapter } from '../amazon-berkeley.adapter';

describe('licensed Amazon Berkeley catalog', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'shopnest-abo-'));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  async function adapter() {
    const records = ['amazon.com', 'amazon.co.uk'].map((domain_name) => ({
      item_id: 'A1',
      domain_name,
      item_name: [{ language_tag: 'en_US', value: 'Leather shoes' }],
      brand: [{ language_tag: 'en_US', value: 'Sample brand' }],
      product_type: [{ value: 'SHOES' }],
      color: [{ language_tag: 'en_US', value: 'Blue' }],
      main_image_id: 'front',
      other_image_id: ['front', 'side'],
      bullet_point: [{ language_tag: 'en_US', value: 'Leather upper' }],
    }));
    const files = {
      'images_metadata_images.csv.gz':
        'image_id,height,width,path\nfront,1200,900,ab/abcdef.jpg\nside,1000,1200,cd/cdef01.jpg\n',
      'listings_metadata_listings_0.json.gz': records
        .map((record) => JSON.stringify(record))
        .join('\n'),
    };
    await mkdir(join(directory, 'abo'));
    for (const [name, content] of Object.entries(files)) {
      const bytes = gzipSync(content),
        path = join(directory, 'abo', name);
      await writeFile(path, bytes);
      await writeFile(
        path + '.json',
        JSON.stringify({ etag: 'fixture-version', checkedAt: Date.now(), bytes: bytes.length }),
      );
    }
    return new AmazonBerkeleyAdapter(new ConfigService({ app: { catalogCacheDir: directory } }));
  }
  it('discovers actual categories and preserves metadata, image identities and attribution', async () => {
    const source = await adapter();
    expect(await source.searchCategories('shoe')).toEqual([
      { id: 'SHOES', name: 'Shoes', parents: [] },
    ]);
    const page = await source.fetchProducts({ categories: ['SHOES'], position: 0, limit: 1 });
    expect(page.products[0]).toMatchObject({
      externalId: 'amazon.com:A1',
      name: 'Leather shoes',
      brand: 'Sample brand',
      specifications: { Color: 'Blue' },
      imageCount: 2,
      description: 'Leather upper',
    });
    expect(page.products[0].attribution?.license).toContain('CC BY 4.0');
    expect(page.products[0].imageUrls?.[0]).toContain('/images/original/ab/abcdef.jpg');
    expect(page.products[0].priceCents).toBeUndefined();
    expect(page.nextPosition).toBe(1);
    expect(
      (await source.fetchProducts({ categories: ['SHOES'], position: page.nextPosition, limit: 1 }))
        .products[0].externalId,
    ).toBe('amazon.co.uk:A1');
  });
  it('reuses prepared metadata and advances across source shards without pretending exhaustion', async () => {
    const source = await adapter();
    expect(await source.datasetVersion()).toContain('fixture-version');
    const page = await source.fetchProducts({ categories: ['SHOES'], position: 0, limit: 10 });
    expect(page.nextPosition).toBe(100000);
    expect(page.exhausted).toBe(false);
    expect((await source.fetchProducts({ position: 1600000 })).exhausted).toBe(true);
  });
  it('reads the publisher’s hexadecimal shard names beyond the first ten files', async () => {
    const source = await adapter();
    const listing = {
      item_id: 'LATER',
      domain_name: 'amazon.com',
      item_name: [{ language_tag: 'en_US', value: 'Later watch' }],
      product_type: [{ value: 'WATCH' }],
      main_image_id: 'front',
    };
    for (const shard of ['a', 'f']) {
      const bytes = gzipSync(JSON.stringify(listing));
      const path = join(directory, 'abo', `listings_metadata_listings_${shard}.json.gz`);
      await writeFile(path, bytes);
      await writeFile(
        path + '.json',
        JSON.stringify({ etag: 'fixture-version', checkedAt: Date.now(), bytes: bytes.length }),
      );
    }
    expect(
      (await source.fetchProducts({ categories: ['WATCH'], position: 1000000 })).products[0]
        .externalId,
    ).toBe('amazon.com:LATER');
    const last = await source.fetchProducts({ categories: ['WATCH'], position: 1500000 });
    expect(last.products).toHaveLength(1);
    expect(last.exhausted).toBe(true);
  });
});
