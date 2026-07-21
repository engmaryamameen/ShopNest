/**
 * Validate a returnTo path to prevent open-redirect attacks.
 * Only accepts relative paths on the same origin.
 */
export function validateReturnTo(candidate: string | null | undefined): string {
  if (!candidate) return '/';
  if (candidate.startsWith('/') && !candidate.startsWith('//')) {
    try {
      const u = new URL(candidate, 'https://dummy.local');
      if (u.hostname === 'dummy.local') return u.pathname + u.search;
    } catch {
    }
  }
  return '/';
}
