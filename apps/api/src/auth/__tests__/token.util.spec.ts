import { generateRefreshToken, hashToken } from '../token.util';

describe('token.util', () => {
  describe('generateRefreshToken', () => {
    it('returns 128-character hex raw token (64 bytes)', () => {
      const { raw } = generateRefreshToken();
      expect(raw).toMatch(/^[0-9a-f]{128}$/);
    });

    it('returns a SHA-256 hex hash (64 characters)', () => {
      const { hash } = generateRefreshToken();
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('generates unique tokens on each call', () => {
      const t1 = generateRefreshToken();
      const t2 = generateRefreshToken();
      expect(t1.raw).not.toBe(t2.raw);
      expect(t1.hash).not.toBe(t2.hash);
    });

    it('hash is deterministic: hashToken(raw) === hash', () => {
      const { raw, hash } = generateRefreshToken();
      expect(hashToken(raw)).toBe(hash);
    });
  });

  describe('hashToken', () => {
    it('produces the same hash for the same input', () => {
      const raw = 'test-token-value';
      expect(hashToken(raw)).toBe(hashToken(raw));
    });

    it('produces different hashes for different inputs', () => {
      expect(hashToken('a')).not.toBe(hashToken('b'));
    });
  });
});
