import { randomBytes, createHash } from 'node:crypto';

/**
 * 64 random bytes (512 bits of entropy), SHA-256-hashed for deterministic
 * database lookup. The security guarantee comes from the token's entropy,
 * not the hash function's resistance to brute force (see DECISIONS.md) —
 * this is the shared primitive behind every bearer-token-in-a-link flow in
 * the app: refresh tokens, email verification, password reset, and vendor
 * staff invites.
 */
export function generateSecureToken(): { raw: string; hash: string } {
  const raw = randomBytes(64).toString('hex');
  const hash = createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

export function generateRefreshToken(): { raw: string; hash: string } {
  return generateSecureToken();
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
