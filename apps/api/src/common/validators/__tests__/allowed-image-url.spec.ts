describe('isAllowedImageUrl', () => {
  const ORIGINAL_ENV = process.env.MEDIA_PUBLIC_BASE_URL;

  beforeAll(() => {
    process.env.MEDIA_PUBLIC_BASE_URL = 'https://media.shopnest.example';
  });

  afterAll(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.MEDIA_PUBLIC_BASE_URL;
    else process.env.MEDIA_PUBLIC_BASE_URL = ORIGINAL_ENV;
  });

  async function load() {
    jest.resetModules();
    return import('../allowed-image-url');
  }

  it('accepts a URL on the approved media origin', async () => {
    const { isAllowedImageUrl } = await load();
    expect(isAllowedImageUrl('https://media.shopnest.example/uploads/abc.png')).toBe(true);
  });

  it('rejects an arbitrary public origin not on the allow-list', async () => {
    const { isAllowedImageUrl } = await load();
    expect(isAllowedImageUrl('https://evil.example/x.png')).toBe(false);
    expect(isAllowedImageUrl('https://cdn.dummyjson.com/products/1/thumbnail.jpg')).toBe(false);
  });

  it('rejects a subdomain/suffix trick against the approved host', async () => {
    const { isAllowedImageUrl } = await load();
    expect(isAllowedImageUrl('https://media.shopnest.example.evil.com/x.png')).toBe(false);
    expect(isAllowedImageUrl('https://evil-media.shopnest.example/x.png')).toBe(false);
  });

  it('rejects loopback, private, and link-local IP literals regardless of allow-list', async () => {
    const { isAllowedImageUrl } = await load();
    expect(isAllowedImageUrl('https://127.0.0.1/x.png')).toBe(false);
    expect(isAllowedImageUrl('https://10.0.0.5/x.png')).toBe(false);
    expect(isAllowedImageUrl('https://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isAllowedImageUrl('https://[::1]/x.png')).toBe(false);
  });

  it('rejects alternative/encoded host representations of a real host', async () => {
    const { isAllowedImageUrl } = await load();
    expect(isAllowedImageUrl('https://2130706433/x.png')).toBe(false); // decimal for 127.0.0.1
    expect(isAllowedImageUrl('https://0x7f000001/x.png')).toBe(false); // hex for 127.0.0.1
    expect(isAllowedImageUrl('https://017700000001/x.png')).toBe(false); // octal for 127.0.0.1
  });

  it('matching is case-insensitive on the hostname but still exact-origin', async () => {
    const { isAllowedImageUrl } = await load();
    expect(isAllowedImageUrl('https://MEDIA.SHOPNEST.EXAMPLE/x.png')).toBe(true);
  });

  it('rejects credentials embedded in the URL', async () => {
    const { isAllowedImageUrl } = await load();
    expect(isAllowedImageUrl('https://user:pass@media.shopnest.example/x.png')).toBe(false);
  });

  it('rejects an unexpected port on an otherwise-approved host', async () => {
    const { isAllowedImageUrl } = await load();
    expect(isAllowedImageUrl('https://media.shopnest.example:8443/x.png')).toBe(false);
  });

  it('rejects disallowed protocols', async () => {
    const { isAllowedImageUrl } = await load();
    expect(isAllowedImageUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedImageUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedImageUrl('ftp://media.shopnest.example/x.png')).toBe(false);
    expect(isAllowedImageUrl('data:image/png;base64,abcd')).toBe(false);
  });

  it('rejects malformed input', async () => {
    const { isAllowedImageUrl } = await load();
    expect(isAllowedImageUrl('not a url at all')).toBe(false);
    expect(isAllowedImageUrl('')).toBe(false);
    expect(isAllowedImageUrl(undefined)).toBe(false);
    expect(isAllowedImageUrl(123)).toBe(false);
  });

  it('accepts the exact approved Amazon product-image host', async () => {
    const { isAllowedImageUrl } = await load();
    expect(isAllowedImageUrl('https://m.media-amazon.com/images/I/41qfjSfqNyL.jpg')).toBe(true);
  });

  it('rejects the Amazon host over plain http', async () => {
    const { isAllowedImageUrl } = await load();
    expect(isAllowedImageUrl('http://m.media-amazon.com/images/I/41qfjSfqNyL.jpg')).toBe(false);
  });

  it('rejects Amazon lookalike domains', async () => {
    const { isAllowedImageUrl } = await load();
    expect(isAllowedImageUrl('https://m.media-amazon.com.evil.com/x.jpg')).toBe(false);
    expect(isAllowedImageUrl('https://media-amazon.com/x.jpg')).toBe(false);
    expect(isAllowedImageUrl('https://amazon.com/x.jpg')).toBe(false);
    expect(isAllowedImageUrl('https://m-media-amazon.com/x.jpg')).toBe(false);
  });

  it('rejects other Amazon subdomains — only the exact approved host matches', async () => {
    const { isAllowedImageUrl } = await load();
    expect(isAllowedImageUrl('https://images-na.ssl-images-amazon.com/x.jpg')).toBe(false);
    expect(isAllowedImageUrl('https://www.amazon.com/x.jpg')).toBe(false);
    expect(isAllowedImageUrl('https://cdn.m.media-amazon.com/x.jpg')).toBe(false);
  });

  it('rejects credentials or an unexpected port on the Amazon host', async () => {
    const { isAllowedImageUrl } = await load();
    expect(isAllowedImageUrl('https://user:pass@m.media-amazon.com/x.jpg')).toBe(false);
    expect(isAllowedImageUrl('https://m.media-amazon.com:8443/x.jpg')).toBe(false);
  });
});
