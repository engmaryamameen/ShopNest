import { randomBytes, createHash } from 'node:crypto';

export function generateRefreshToken(): { raw: string; hash: string } {
  const raw = randomBytes(64).toString('hex');
  const hash = createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
