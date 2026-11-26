import { AmazonAdapter } from '../amazon.adapter';
const row = {
  parent_asin: 'B001',
  title: 'Wireless Keyboard',
  main_category: 'Electronics',
  store: 'Acme Outlet',
  description: ['Wireless keyboard for work.'],
  features: ['Backlit keys'],
  details: { Brand: 'Acme', Battery: 'Rechargeable', UPC: '012345678905' },
  images: [
    { hi_res: 'https://m.media-amazon.com/images/I/a.jpg' },
    { hi_res: 'https://m.media-amazon.com/images/I/a._SL300_.jpg' },
    { large: 'https://m.media-amazon.com/images/I/b.jpg' },
  ],
};
describe('Amazon metadata bounded range retrieval', () => {
  afterEach(() => jest.restoreAllMocks());
  function setup() {
    const config = {
      get: () =>
        'https://huggingface.co/datasets/McAuley-Lab/Amazon-Reviews-2023/resolve/main/raw/meta_categories',
    };
    const adapter = new AmazonAdapter(config as never);
    const fetch = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (input) =>
        String(input).includes('/api/datasets/')
          ? new Response(
              JSON.stringify([
                { path: 'raw/meta_categories/meta_Electronics.jsonl', oid: 'version1' },
              ]),
            )
          : new Response(JSON.stringify(row) + '\n'),
      );
    return { adapter, fetch };
  }
  it('discovers actual metadata files and preserves useful product fields without review data or historical commercial prices', async () => {
    const { adapter } = setup();
    expect(await adapter.searchCategories('elect')).toEqual([
      { id: 'Electronics', name: 'Electronics', parents: [] },
    ]);
    expect(await adapter.datasetVersion('Electronics')).toBe('version1');
    const result = await adapter.fetchProducts({ categories: ['Electronics'], limit: 1 });
    expect(result.products[0]).toMatchObject({
      externalId: 'B001',
      brand: 'Acme',
      imageCount: 2,
      specifications: { Battery: 'Rechargeable' },
      gtin: '00012345678905',
    });
    expect(result.products[0].priceCents).toBeUndefined();
    expect(result.products[0].description).toContain('Backlit keys');
  });
  it('returns the exact consumed byte boundary and resumes using HTTP Range', async () => {
    const { adapter, fetch } = setup();
    const first = await adapter.fetchProducts({ categories: ['Electronics'], limit: 1 });
    expect(first.nextPosition).toBe(Buffer.byteLength(JSON.stringify(row) + '\n'));
    fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ...row, parent_asin: 'B002' }) + '\n', { status: 206 }),
    );
    const second = await adapter.fetchProducts({
      categories: ['Electronics'],
      position: first.nextPosition,
      limit: 1,
    });
    expect(fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('meta_Electronics.jsonl'),
      expect.objectContaining({ headers: { Range: `bytes=${first.nextPosition}-` } }),
    );
    expect(second.products[0].externalId).toBe('B002');
  });
  it('refuses a host that ignores an incremental range request', async () => {
    const { adapter } = setup();
    await adapter.searchCategories('');
    await expect(
      adapter.fetchProducts({ categories: ['Electronics'], position: 100 }),
    ).rejects.toThrow('incremental range');
  });
  it('counts malformed records and marks end-of-file exhaustion', async () => {
    const { adapter, fetch } = setup();
    await adapter.searchCategories('');
    fetch.mockResolvedValueOnce(new Response('invalid\n{}\n' + JSON.stringify(row)));
    const result = await adapter.fetchProducts({ categories: ['Electronics'], limit: 10 });
    expect(result.skippedCount).toBe(2);
    expect(result.exhausted).toBe(true);
    expect(result.products).toHaveLength(1);
  });
  it('requires selected source categories and never scans unrelated category files', async () => {
    const { adapter, fetch } = setup();
    await expect(adapter.fetchProducts()).rejects.toThrow('Select an Amazon');
    expect(fetch).not.toHaveBeenCalled();
  });
});
