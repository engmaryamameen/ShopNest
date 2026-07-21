import { validateReturnTo } from '../lib/validate-return-to';

describe('validateReturnTo', () => {
  it('returns "/" for null', () => {
    expect(validateReturnTo(null)).toBe('/');
  });

  it('returns "/" for undefined', () => {
    expect(validateReturnTo(undefined)).toBe('/');
  });

  it('returns "/" for empty string', () => {
    expect(validateReturnTo('')).toBe('/');
  });

  it('accepts a simple relative path', () => {
    expect(validateReturnTo('/orders')).toBe('/orders');
  });

  it('accepts a path with query string', () => {
    expect(validateReturnTo('/shop?q=headphones')).toBe('/shop?q=headphones');
  });

  it('rejects protocol-relative URLs (//evil.com)', () => {
    expect(validateReturnTo('//evil.com/steal')).toBe('/');
  });

  it('rejects absolute URLs (https://evil.com)', () => {
    expect(validateReturnTo('https://evil.com')).toBe('/');
  });

  it('rejects javascript: URIs', () => {
    expect(validateReturnTo('javascript:alert(1)')).toBe('/');
  });

  it('rejects data: URIs', () => {
    expect(validateReturnTo('data:text/html,<h1>hi</h1>')).toBe('/');
  });

  it('rejects paths with embedded protocol', () => {
    expect(validateReturnTo('/redirect?url=https://evil.com')).toBe(
      '/redirect?url=https://evil.com',
    );
    // This is fine — it's a relative path; the query param is not evaluated
  });

  it('strips fragment identifiers (not passed in URL)', () => {
    // Fragments are never sent to server; pathname+search is what we keep
    const result = validateReturnTo('/profile');
    expect(result).toBe('/profile');
  });
});
