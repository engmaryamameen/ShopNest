import { resolveFirstPartyOrigin, originKey } from '@shopnest/media-origins';

const FIRST_PARTY_ORIGIN = originKey(
  resolveFirstPartyOrigin(process.env.MEDIA_PUBLIC_BASE_URL, process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'),
);

export function isFirstPartyImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).origin === FIRST_PARTY_ORIGIN;
  } catch {
    return false;
  }
}
