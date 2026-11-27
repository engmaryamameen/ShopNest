import { CatalogImportImagesService } from '../catalog-import-images.service';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lN8AAAAASUVORK5CYII=',
  'base64',
);
describe('safe catalog media ingestion', () => {
  afterEach(() => jest.restoreAllMocks());
  function setup() {
    const storage = {
      upload: jest.fn(async (_file, hash) => ({
        url: `http://localhost:3001/uploads/${hash}.png`,
      })),
    };
    const service = new CatalogImportImagesService(storage as never);
    const fetch = jest
      .spyOn(global, 'fetch')
      .mockImplementation(
        async () => new Response(png, { headers: { 'content-type': 'image/png' } }),
      );
    return { service, storage, fetch };
  }
  it('rejects credentials, non-HTTPS, unapproved hosts, private addresses and nonstandard ports before fetching', async () => {
    const { service, fetch } = setup();
    expect(
      await service.ingest([
        'http://images.openfoodfacts.org/a.png',
        'https://127.0.0.1/a.png',
        'https://images.openfoodfacts.org:8443/a.png',
        'https://user:password@images.openfoodfacts.org/a.png',
        'https://images.openfoodfacts.org.evil.example/a.png',
      ]),
    ).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('deduplicates identical photo content and reuses validated, content-addressed storage', async () => {
    const { service, storage, fetch } = setup();
    const urls = [
      'https://images.openfoodfacts.org/a.png',
      'https://images.openfoodfacts.org/b.png',
    ];
    expect(await service.ingest(urls)).toHaveLength(1);
    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(await service.ingest([urls[0]])).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[0][0])).toBe(urls[0]);
    expect(fetch.mock.calls[0][1]).toEqual(expect.objectContaining({ redirect: 'error' }));
  });
  it('checks actual dimensions and MIME bytes instead of trusting URL extensions', async () => {
    const { service, storage, fetch } = setup();
    expect(await service.ingest(['https://images.openfoodfacts.org/small.png'], 800)).toEqual([]);
    fetch.mockResolvedValueOnce(new Response(png, { headers: { 'content-type': 'image/jpeg' } }));
    expect(await service.ingest(['https://images.openfoodfacts.org/not-a-jpeg.jpg'])).toEqual([]);
    expect(storage.upload).not.toHaveBeenCalled();
  });
  it('validates photos with at most three concurrent requests and reports batch progress', async () => {
    const { service, fetch, storage } = setup();
    let active = 0,
      peak = 0;
    fetch.mockImplementation(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => setImmediate(resolve));
      active--;
      return new Response(png, { headers: { 'content-type': 'image/png' } });
    });
    const progress = jest.fn(async () => undefined);
    const urls = Array.from({ length: 7 }, (_, i) => `https://images.openbeautyfacts.org/${i}.png`);
    expect(await service.ingest(urls, 0, progress)).toHaveLength(1);
    expect(peak).toBe(3);
    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(progress.mock.calls).toEqual(Array.from({ length: 7 }, (_, i) => [i + 1, 7]));
  });
  it('bounds advertised and streamed file sizes before storing content', async () => {
    const { service, storage, fetch } = setup();
    fetch.mockResolvedValueOnce(
      new Response(png, {
        headers: { 'content-length': '999999999', 'content-type': 'image/png' },
      }),
    );
    expect(await service.ingest(['https://images.openfoodfacts.org/large.png'])).toEqual([]);
    expect(service.failuresByReason['Declared image size exceeds limit']).toBe(1);
    expect(service.failuresByReason['HTTP 200']).toBeUndefined();
    fetch.mockResolvedValueOnce(
      new Response(Buffer.alloc(5 * 1024 * 1024 + 1), { headers: { 'content-type': 'image/png' } }),
    );
    expect(await service.ingest(['https://images.openfoodfacts.org/stream.png'])).toEqual([]);
    expect(storage.upload).not.toHaveBeenCalled();
  });
  it('reuses failed-request results for a bounded period rather than repeating the same download', async () => {
    const { service, fetch } = setup();
    fetch.mockResolvedValueOnce(new Response(null, { status: 404 }));
    const url = 'https://images.openbeautyfacts.org/unavailable.jpg';
    expect(await service.ingest([url])).toEqual([]);
    expect(await service.ingest([url])).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
