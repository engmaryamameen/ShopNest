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
