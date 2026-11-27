describe('isFirstPartyImageUrl', () => {
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
    return import('../is-first-party-image');
  }

  it('treats the configured first-party origin as first-party', async () => {
    const { isFirstPartyImageUrl } = await load();
    expect(isFirstPartyImageUrl('https://media.shopnest.example/uploads/a.png')).toBe(true);
  });

  it('treats the approved Amazon origin as NOT first-party — it must go through the unoptimized path', async () => {
    const { isFirstPartyImageUrl } = await load();
    expect(isFirstPartyImageUrl('https://m.media-amazon.com/images/I/41qfjSfqNyL.jpg')).toBe(false);
  });

  it('treats any other host as not first-party', async () => {
    const { isFirstPartyImageUrl } = await load();
    expect(isFirstPartyImageUrl('https://evil.example/x.png')).toBe(false);
  });

  it('handles null/undefined/malformed input safely', async () => {
    const { isFirstPartyImageUrl } = await load();
    expect(isFirstPartyImageUrl(null)).toBe(false);
    expect(isFirstPartyImageUrl(undefined)).toBe(false);
    expect(isFirstPartyImageUrl('not a url')).toBe(false);
  });
});
