export interface ApprovedOrigin {
  protocol: 'http' | 'https';
  hostname: string;
  port?: string;
}

export const APPROVED_SUPPLIER_ORIGINS: readonly ApprovedOrigin[] = [
  { protocol: 'https', hostname: 'm.media-amazon.com' },
];

export function resolveFirstPartyOrigin(mediaPublicBaseUrl: string | undefined, fallback: string): ApprovedOrigin {
  const url = new URL(mediaPublicBaseUrl ?? fallback);
  return {
    protocol: url.protocol === 'https:' ? 'https' : 'http',
    hostname: url.hostname,
    port: url.port || undefined,
  };
}

export function resolveApprovedOrigins(mediaPublicBaseUrl: string | undefined, fallback: string): ApprovedOrigin[] {
  return [resolveFirstPartyOrigin(mediaPublicBaseUrl, fallback), ...APPROVED_SUPPLIER_ORIGINS];
}

export function originKey(origin: ApprovedOrigin): string {
  return `${origin.protocol}://${origin.hostname}${origin.port ? `:${origin.port}` : ''}`;
}
